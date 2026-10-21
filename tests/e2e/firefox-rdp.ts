/**
 * Minimal Firefox Remote Debugging Protocol (RDP) client: the protocol
 * about:debugging and web-ext use. Playwright's Firefox (Juggler) cannot load
 * an extension and never attaches to moz-extension:// documents, so on
 * Firefox the E2E fixtures go through RDP for everything inside the
 * extension:
 *
 * - `installTemporaryAddon` on the addons actor loads the unpacked build;
 * - the addon's watcher reports every extension document (background page,
 *   options tab, toolbar popup) as a frame target with a console actor;
 * - `evaluateJSAsync` on that console actor runs code in the document.
 *
 * Wire format: `<byte length>:<JSON>`. Replies come back from the addressed
 * actor in request order and carry no `type`; events carry a `type`.
 * See https://firefox-source-docs.mozilla.org/devtools/backend/protocol.html
 */
import net from 'node:net';

const REQUEST_TIMEOUT = 15_000;

type Packet = Record<string, any> & { from: string };

export interface FrameTarget {
  actor: string;
  consoleActor: string;
  url: string;
}

export class RdpClient {
  private socket: net.Socket;
  private buffer = Buffer.alloc(0);
  private pending = new Map<string, { resolve: (p: Packet) => void; reject: (e: Error) => void }[]>();
  private listeners = new Set<(p: Packet) => void>();
  private closed = false;

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.on('data', (data) => this.onData(data));
    socket.on('close', () => this.fail(new Error('RDP connection closed')));
    socket.on('error', (e) => this.fail(e));
  }

  /** Connect to `-start-debugger-server`, retrying until Firefox listens. */
  static async connect(port: number, timeoutMs = 30_000): Promise<RdpClient> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        return await RdpClient.tryConnect(port);
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error(`Firefox debugger server on port ${port} did not answer: ${lastError}`);
  }

  private static tryConnect(port: number) {
    return new Promise<RdpClient>((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('error', reject);
      const client = new RdpClient(socket);
      // The server greets with an unsolicited packet from `root`.
      client.expectReply('root', 5_000).then(() => {
        socket.off('error', reject);
        resolve(client);
      }, reject);
    });
  }

  close() {
    this.closed = true;
    this.socket.destroy();
  }

  /** Listen to unsolicited packets (events). Returns an unsubscribe function. */
  on(listener: (p: Packet) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async request(to: string, type: string, params: Record<string, unknown> = {}): Promise<Packet> {
    const reply = this.expectReply(to, REQUEST_TIMEOUT, `${type} to ${to}`);
    const body = JSON.stringify({ to, type, ...params });
    this.socket.write(`${Buffer.byteLength(body)}:${body}`);
    const packet = await reply;
    if (packet.error) throw new Error(`RDP ${type}: ${packet.error} ${packet.message ?? ''}`);
    return packet;
  }

  /**
   * Run `fn(arg)` in the document behind `consoleActor` and return its
   * (awaited) result. Like Playwright's evaluate, `fn` must be
   * self-contained and its result JSON-serializable.
   */
  async evaluate<R, A>(consoleActor: string, fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R> {
    const text = `(async () => JSON.stringify(await (${fn.toString()})(${JSON.stringify(arg)}) ?? null))()`;
    let resultID: string | undefined;
    const early: Packet[] = [];
    let done: ((p: Packet) => void) | undefined;
    let timer: NodeJS.Timeout | undefined;
    const off = this.on((p) => {
      if (p.type !== 'evaluationResult') return;
      if (resultID === undefined) early.push(p);
      else if (p.resultID === resultID) done?.(p);
    });
    try {
      const ack = await this.request(consoleActor, 'evaluateJSAsync', { text, mapped: { await: true } });
      resultID = ack.resultID;
      const packet =
        early.find((p) => p.resultID === resultID) ??
        (await new Promise<Packet>((resolve, reject) => {
          done = resolve;
          timer = setTimeout(
            () => reject(new Error(`evaluate timed out: ${fn.toString().slice(0, 120)}`)),
            REQUEST_TIMEOUT,
          );
        }));
      if (packet.hasException) {
        const message = packet.exceptionMessage ?? JSON.stringify(packet.exception);
        throw new Error(`evaluate threw: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
      }
      let json = packet.result;
      // Strings over 10k characters come back as a long string grip.
      if (json?.type === 'longString') {
        json = (await this.request(json.actor, 'substring', { start: 0, end: json.length })).substring;
      }
      return typeof json === 'string' ? JSON.parse(json) : (undefined as R);
    } finally {
      clearTimeout(timer);
      off();
    }
  }

  private expectReply(from: string, timeoutMs: number, label = from) {
    return new Promise<Packet>((resolve, reject) => {
      if (this.closed) return reject(new Error('RDP connection closed'));
      const timer = setTimeout(() => {
        const queue = this.pending.get(from) ?? [];
        const i = queue.indexOf(entry);
        if (i >= 0) queue.splice(i, 1);
        reject(new Error(`RDP request timed out: ${label}`));
      }, timeoutMs);
      const entry = {
        resolve: (p: Packet) => {
          clearTimeout(timer);
          resolve(p);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      this.pending.set(from, [...(this.pending.get(from) ?? []), entry]);
    });
  }

  private onData(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);
    for (;;) {
      const sep = this.buffer.indexOf(':');
      if (sep < 0) return;
      const length = Number(this.buffer.subarray(0, sep).toString());
      if (this.buffer.length < sep + 1 + length) return;
      const packet: Packet = JSON.parse(this.buffer.subarray(sep + 1, sep + 1 + length).toString());
      this.buffer = this.buffer.subarray(sep + 1 + length);
      this.dispatch(packet);
    }
  }

  private dispatch(packet: Packet) {
    // Replies (and the greeting from root) carry no `type`, events do.
    if (packet.type === undefined) {
      const queue = this.pending.get(packet.from);
      const next = queue?.shift();
      if (next) return next.resolve(packet);
    }
    for (const listener of this.listeners) listener(packet);
  }

  private fail(error: Error) {
    this.closed = true;
    for (const queue of this.pending.values()) for (const entry of queue) entry.reject(error);
    this.pending.clear();
  }
}

/**
 * A temporarily installed extension and its live documents, keyed by
 * target actor.
 */
export class FirefoxAddon {
  readonly targets = new Map<string, FrameTarget>();

  private constructor(
    readonly client: RdpClient,
    readonly id: string,
  ) {}

  /** Install the unpacked extension in `dir` and start watching its documents. */
  static async install(client: RdpClient, dir: string): Promise<FirefoxAddon> {
    const root = await client.request('root', 'getRoot');
    const { addon } = await client.request(root.addonsActor, 'installTemporaryAddon', { addonPath: dir });
    const self = new FirefoxAddon(client, addon.id);
    const { addons } = await client.request('root', 'listAddons');
    const descriptor = addons.find((a: any) => a.id === addon.id);
    if (!descriptor) throw new Error(`addon ${addon.id} not listed after install`);
    const watcher = await client.request(descriptor.actor, 'getWatcher', { isServerTargetSwitchingEnabled: true });
    client.on((p) => {
      if (p.from !== watcher.actor) return;
      if (p.type === 'target-available-form' && p.target.consoleActor) {
        self.targets.set(p.target.actor, { actor: p.target.actor, consoleActor: p.target.consoleActor, url: p.target.url });
      } else if (p.type === 'target-destroyed-form') {
        self.targets.delete(p.target.actor);
      }
    });
    await client.request(watcher.actor, 'watchTargets', { targetType: 'frame' });
    return self;
  }

  /** The newest live document whose URL starts with `prefix`. */
  find(prefix: string): FrameTarget | undefined {
    return [...this.targets.values()].reverse().find((t) => t.url?.startsWith(prefix));
  }

  async waitFor(prefix: string, timeoutMs = 15_000): Promise<FrameTarget> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const target = this.find(prefix);
      if (target) return target;
      if (Date.now() > deadline) throw new Error(`no extension document ${prefix}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async waitGone(target: FrameTarget, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (this.targets.has(target.actor) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
