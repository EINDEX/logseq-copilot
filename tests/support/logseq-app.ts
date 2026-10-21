/**
 * Boots a real Logseq desktop app with its HTTP API server enabled, loads a
 * test graph and seeds data. Shared by the integration tests
 * (tests/integration) and the browser E2E tests (tests/e2e).
 *
 * Everything Logseq writes goes to a throwaway HOME / user data dir, and the
 * API server listens on its own port, so an installed Logseq the developer is
 * using is never touched (see `assertPortFree`).
 */
import { _electron as electron, ElectronApplication, Page } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export type LogseqVariant = 'file' | 'db';

export const DEFAULT_API_HOST = '127.0.0.1';
export const DEFAULT_API_PORT = 12315;
export const DEFAULT_API_TOKEN = 'logseq-copilot-ci-token';

/** The fixture graph is a file graph; the DB graph is seeded with the same blocks. */
export const FIXTURE_GRAPH = path.resolve(
  __dirname,
  '../integration/fixtures/file-graph',
);
export const TEST_PAGE = 'Copilot Test Page';
export const OTHER_PAGE = 'Another Page';

/** One block of a fixture page: text, optional fixed uuid (`id::`), children. */
export interface OutlineBlock {
  content: string;
  id?: string;
  children: OutlineBlock[];
}

/**
 * Parse a Logseq markdown page of the fixture graph: `- ` starts a block,
 * tabs nest it, lines indented by two more spaces continue it. An `id::`
 * line becomes the block uuid (the DB graph gets it as `customUUID`).
 */
export function parseOutline(markdown: string): OutlineBlock[] {
  const roots: OutlineBlock[] = [];
  const stack: { depth: number; block: OutlineBlock }[] = [];
  let current: OutlineBlock | undefined;
  for (const line of markdown.split('\n')) {
    const start = line.match(/^(\t*)- (.*)$/);
    if (start) {
      const depth = start[1].length;
      const block: OutlineBlock = { content: start[2], children: [] };
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      (stack.length ? stack[stack.length - 1].block.children : roots).push(block);
      stack.push({ depth, block });
      current = block;
      continue;
    }
    const more = line.match(/^\t*  (.*)$/);
    if (more && current) {
      const id = more[1].match(/^id:: ([0-9a-f-]{36})$/);
      if (id) current.id = id[1];
      else current.content += `\n${more[1]}`;
    }
  }
  return roots;
}

/** Pages of the fixture graph, in file name order: page name -> blocks. */
export function fixturePages(): [string, OutlineBlock[]][] {
  const dir = path.join(FIXTURE_GRAPH, 'pages');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => [f.slice(0, -3), parseOutline(fs.readFileSync(path.join(dir, f), 'utf8'))]);
}

/**
 * Search keywords of the fixture data and how many block hits each needs
 * before the graph counts as indexed. `showcase`: rich content (long text,
 * code, table, image, references, properties, nesting, CJK); `bulkitem`: more
 * results than the sidebar shows at first.
 */
export const INDEXED_KEYWORDS: Record<string, number> = {
  copilot: 3,
  showcase: 10,
  bulkitem: 10,
};

export interface LogseqAppOptions {
  variant: LogseqVariant;
  /** Logseq executable, see scripts/download-logseq.sh. */
  executablePath: string;
  host?: string;
  port?: number;
  token?: string;
  /** Written when setup fails. */
  failureScreenshot?: string;
  /** Stream Logseq's own stdout/stderr. */
  debug?: boolean;
  logger?: (msg: string) => void;
}

export interface LogseqApp {
  variant: LogseqVariant;
  host: string;
  port: number;
  token: string;
  /** http://host:port */
  apiUrl: string;
  /** Name of the graph that is open. */
  graph: string;
  version: string;
  callApi: (method: string, args?: unknown[]) => Promise<any>;
  close: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createApiCaller(apiUrl: string, token: string) {
  return async function callApi(method: string, args: unknown[] = []) {
    const resp = await fetch(`${apiUrl}/api`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ method, args }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await resp.text();
    if (resp.status !== 200) {
      throw new Error(`${method} -> ${resp.status} ${text}`);
    }
    return text ? JSON.parse(text) : null;
  };
}

export async function waitFor<T>(
  label: string,
  fn: () => Promise<T | undefined | null | false>,
  timeoutMs = 120_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (e) {
      lastError = e;
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${label}: ${lastError ?? ''}`);
}

/**
 * Refuse to start when something already listens on the API port: it is most
 * likely the developer's own Logseq, and the tests would write into its graph.
 */
async function assertPortFree(host: string, port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (e: NodeJS.ErrnoException) =>
      reject(
        new Error(
          `Port ${host}:${port} is already in use (${e.code}). Another Logseq ` +
            'is probably running; set LOGSEQ_API_PORT to a free port.',
        ),
      ),
    );
    server.listen(port, host, () => server.close(() => resolve()));
  });
}

/**
 * Logseq reads the API server settings from <userData>/configs.edn. Writing it
 * before launch gives us autostart and a known token without touching the UI.
 *
 * userData is ~/.config/Logseq on Linux (follows HOME / XDG_CONFIG_HOME), but
 * ~/Library/Application Support/Logseq on macOS, which ignores HOME; so it is
 * also passed explicitly with --user-data-dir.
 */
function prepareHome(host: string, port: number, token: string) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'logseq-home-'));
  const userData = path.join(home, '.config', 'Logseq');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'configs.edn'),
    `{:server/autostart true :server/host "${host}" :server/port ${port} ` +
      `:server/tokens [{:name "ci" :value "${token}"}]}`,
  );
  return { home, userData };
}

async function ensureApiServer(win: Page, callApi: LogseqApp['callApi']) {
  try {
    await waitFor('API server autostart', () => callApi('logseq.App.getAppInfo'), 30_000);
  } catch {
    // Autostart is driven by a UI component; kick the server manually if it
    // did not come up on its own.
    await win.evaluate(() => (window as any).apis.doAction(['server/do', 'restart']));
    await waitFor('API server restart', () => callApi('logseq.App.getAppInfo'), 30_000);
  }
}

async function loadFileGraph(win: Page, home: string, callApi: LogseqApp['callApi']) {
  const graphDir = path.join(home, 'graphs', 'copilot-file-graph');
  fs.cpSync(FIXTURE_GRAPH, graphDir, { recursive: true });

  // Same hook Logseq's own e2e tests use to bypass the native folder picker.
  await win.evaluate((dir) => {
    (window as any).__MOCKED_OPEN_DIR_PATH__ = dir;
  }, graphDir);
  await win.locator('strong:has-text("Choose a folder")').click({ timeout: 60_000 });

  await waitFor('file graph to open', async () => {
    const graph = await callApi('logseq.App.getCurrentGraph');
    // macOS resolves the tmp dir through /private.
    return graph?.path && fs.realpathSync(graph.path) === fs.realpathSync(graphDir);
  });
  await waitForIndex('file graph', callApi);
}

async function waitForIndex(label: string, callApi: LogseqApp['callApi']) {
  for (const [keyword, count] of Object.entries(INDEXED_KEYWORDS)) {
    await waitFor(`${label} to be indexed (${keyword})`, async () => {
      const result = await callApi('logseq.App.search', [keyword]);
      return result?.blocks?.length >= count;
    });
  }
}

/** Create `blocks` below `parent` (a page name for the top level). */
/** DB graphs keep the task state in the status property, not a prefix. */
const DB_STATUS: Record<string, string> = { TODO: 'Todo', DOING: 'Doing', DONE: 'Done', CANCELED: 'Canceled' };

async function seedBlocks(
  callApi: LogseqApp['callApi'],
  page: string,
  blocks: OutlineBlock[],
  parent?: string,
) {
  let previous: string | undefined;
  for (const block of blocks) {
    const opts = block.id ? { customUUID: block.id } : {};
    const marker = block.content.match(/^(TODO|DOING|DONE|CANCELED) /);
    const content = marker ? block.content.slice(marker[0].length) : block.content;
    const created = parent
      ? await callApi('logseq.Editor.insertBlock', [
          previous ?? parent,
          content,
          { ...opts, sibling: !!previous },
        ])
      : await callApi('logseq.Editor.appendBlockInPage', [page, content, opts]);
    if (!created?.uuid) throw new Error(`could not create block on ${page}: ${JSON.stringify(created)}`);
    if (marker) {
      await callApi('logseq.Editor.upsertBlockProperty', [
        created.uuid,
        'logseq.property/status',
        DB_STATUS[marker[1]],
      ]);
    }
    previous = created.uuid;
    await seedBlocks(callApi, page, block.children, created.uuid);
  }
}

async function seedDbGraph(callApi: LogseqApp['callApi']) {
  // A fresh 2.x profile starts on a "Demo" graph which is already a DB graph.
  await waitFor('DB graph', async () => (await callApi('logseq.App.checkCurrentIsDbGraph')) === true);
  const pages = fixturePages();
  for (const [page] of pages) {
    await callApi('logseq.Editor.createPage', [page, {}, { redirect: false }]);
  }
  for (const [page, blocks] of pages) {
    await seedBlocks(callApi, page, blocks);
  }
  await waitForIndex('DB graph', callApi);
}

/** All descendants of `pid` (Logseq 2.x runs a db worker as a child process). */
function descendants(pid: number): number[] {
  if (process.platform === 'win32') return [];
  let table: string;
  try {
    table = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const children = new Map<number, number[]>();
  for (const line of table.trim().split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number);
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  const result: number[] = [];
  const queue = [...(children.get(pid) ?? [])];
  while (queue.length) {
    const next = queue.shift()!;
    result.push(next);
    queue.push(...(children.get(next) ?? []));
  }
  return result;
}

function kill(pids: number[]) {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

/** Test runners do not time out global teardown: never wait on Electron. */
async function closeApp(app: ElectronApplication) {
  const proc = app.process();
  const tree = proc.pid ? descendants(proc.pid) : [];
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    app.close().catch(() => {}),
    new Promise((r) => (timer = setTimeout(r, 15_000))),
  ]);
  clearTimeout(timer);
  if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
  // Helpers that outlived the main process (renderer, GPU, db worker).
  kill(tree);
}

/** Read the common options from the environment (LOGSEQ_*). */
export function optionsFromEnv(): LogseqAppOptions {
  const variant = process.env.LOGSEQ_VARIANT as LogseqVariant;
  const executablePath = process.env.LOGSEQ_BIN;
  if (!variant || !['file', 'db'].includes(variant) || !executablePath) {
    throw new Error('LOGSEQ_VARIANT (file|db) and LOGSEQ_BIN must be set');
  }
  return {
    variant,
    executablePath,
    port: process.env.LOGSEQ_API_PORT ? Number(process.env.LOGSEQ_API_PORT) : undefined,
    debug: !!process.env.LOGSEQ_DEBUG,
  };
}

export async function startLogseq(options: LogseqAppOptions): Promise<LogseqApp> {
  const {
    variant,
    executablePath,
    host = DEFAULT_API_HOST,
    port = DEFAULT_API_PORT,
    token = DEFAULT_API_TOKEN,
    failureScreenshot = 'logseq-setup-failure.png',
    logger: step = (msg: string) => console.log(`[logseq] ${msg}`),
  } = options;
  const apiUrl = `http://${host}:${port}`;
  const callApi = createApiCaller(apiUrl, token);

  await assertPortFree(host, port);
  const { home, userData } = prepareHome(host, port, token);
  step(`launching ${executablePath} (port ${port})`);
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`],
    // XDG_CONFIG_HOME (set on GitHub runners) would move userData away from
    // the configs.edn written by prepareHome(). CFFIXED_USER_HOME is the
    // macOS counterpart of HOME for NSHomeDirectory().
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      CFFIXED_USER_HOME: home,
      LANG: 'en_US.UTF-8',
    } as Record<string, string>,
    timeout: 120_000,
  });
  if (options.debug) {
    app.process().stdout?.pipe(process.stdout);
    app.process().stderr?.pipe(process.stderr);
  }

  const cleanup = async () => {
    await closeApp(app);
    fs.rmSync(home, { recursive: true, force: true });
  };

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    step('window loaded, waiting for API server');
    try {
      await ensureApiServer(win, callApi);
      step(`API server up, preparing ${variant} graph`);
      if (variant === 'file') {
        await loadFileGraph(win, home, callApi);
      } else {
        await seedDbGraph(callApi);
      }
    } catch (e) {
      await win.screenshot({ path: failureScreenshot }).catch(() => {});
      throw e;
    }

    const info = await callApi('logseq.App.getAppInfo');
    const graph = await callApi('logseq.App.getCurrentGraph');
    step(`${variant} variant ready, version ${info?.version}, graph ${graph?.name}`);
    return {
      variant,
      host,
      port,
      token,
      apiUrl,
      graph: graph?.name,
      version: info?.version,
      callApi,
      close: async () => {
        step('closing');
        await cleanup();
      },
    };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
