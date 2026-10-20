/**
 * Boots a real Logseq desktop app (under Xvfb on CI) with its HTTP API server
 * enabled, loads a test graph and seeds data, so integration tests can talk to
 * it exactly like the extension does.
 *
 * Env:
 *   LOGSEQ_VARIANT  file | db
 *   LOGSEQ_BIN      path to the extracted Logseq executable
 *                   (see scripts/download-logseq.sh)
 */
import { _electron as electron, ElectronApplication, Page } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

export const API_HOST = '127.0.0.1';
export const API_PORT = 12315;
export const API_TOKEN = 'logseq-copilot-ci-token';

const FIXTURE_GRAPH = path.resolve(__dirname, 'fixtures/file-graph');
const DB_TEST_PAGE = 'Copilot Test Page';
const DB_TEST_BLOCKS = [
  'Hello from copilot integration test',
  'TODO check copilot marker',
  'Reading notes from https://example.com/copilot/article',
];

declare module 'vitest' {
  export interface ProvidedContext {
    logseqVariant: 'file' | 'db';
    logseqApi: string;
    logseqToken: string;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callApi(method: string, args: unknown[] = []) {
  const resp = await fetch(`http://${API_HOST}:${API_PORT}/api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
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
}

async function waitFor<T>(
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
 * Logseq reads the API server settings from <userData>/configs.edn, which is
 * ~/.config/Logseq on Linux. Writing it before launch gives us autostart and a
 * known token without touching the UI.
 */
function prepareHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'logseq-home-'));
  const userData = path.join(home, '.config', 'Logseq');
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'configs.edn'),
    `{:server/autostart true :server/host "${API_HOST}" :server/port ${API_PORT} ` +
      `:server/tokens [{:name "ci" :value "${API_TOKEN}"}]}`,
  );
  return home;
}

async function ensureApiServer(win: Page) {
  try {
    await waitFor('API server autostart', () => callApi('logseq.App.getAppInfo'), 30_000);
  } catch {
    // Autostart is driven by a UI component; kick the server manually if it
    // did not come up on its own.
    await win.evaluate(() => (window as any).apis.doAction(['server/do', 'restart']));
    await waitFor('API server restart', () => callApi('logseq.App.getAppInfo'), 30_000);
  }
}

async function loadFileGraph(win: Page, home: string) {
  const graphDir = path.join(home, 'graphs', 'copilot-file-graph');
  fs.cpSync(FIXTURE_GRAPH, graphDir, { recursive: true });

  // Same hook Logseq's own e2e tests use to bypass the native folder picker.
  await win.evaluate((dir) => {
    (window as any).__MOCKED_OPEN_DIR_PATH__ = dir;
  }, graphDir);
  await win.locator('strong:has-text("Choose a folder")').click({ timeout: 60_000 });

  await waitFor('file graph to open', async () => {
    const graph = await callApi('logseq.App.getCurrentGraph');
    return graph?.path === graphDir;
  });
  await waitFor('file graph to be indexed', async () => {
    const result = await callApi('logseq.App.search', ['copilot']);
    return result?.blocks?.length >= 3;
  });
}

async function seedDbGraph() {
  // A fresh 2.x profile starts on a "Demo" graph which is already a DB graph.
  await waitFor('DB graph', async () => (await callApi('logseq.App.checkCurrentIsDbGraph')) === true);
  await callApi('logseq.Editor.createPage', [DB_TEST_PAGE, {}, { redirect: false }]);
  for (const content of DB_TEST_BLOCKS) {
    await callApi('logseq.Editor.appendBlockInPage', [DB_TEST_PAGE, content]);
  }
  await waitFor('DB graph to be indexed', async () => {
    const result = await callApi('logseq.App.search', ['copilot']);
    return result?.blocks?.length >= 3;
  });
}

let app: ElectronApplication | undefined;

const step = (msg: string) => console.log(`[logseq] ${msg}`);

// Vitest does not time out global setup/teardown, so never wait on Electron
// to exit by itself.
async function closeApp() {
  if (!app) return;
  const proc = app.process();
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    app.close().catch(() => {}),
    new Promise((r) => (timer = setTimeout(r, 15_000))),
  ]);
  clearTimeout(timer);
  if (proc.exitCode === null) proc.kill('SIGKILL');
}

export default async function setup(project: TestProject) {
  const variant = process.env.LOGSEQ_VARIANT as 'file' | 'db';
  const executablePath = process.env.LOGSEQ_BIN;
  if (!variant || !['file', 'db'].includes(variant) || !executablePath) {
    throw new Error('LOGSEQ_VARIANT (file|db) and LOGSEQ_BIN must be set');
  }

  const home = prepareHome();
  step(`launching ${executablePath}`);
  app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-gpu'],
    // XDG_CONFIG_HOME (set on GitHub runners) would move userData away from
    // the configs.edn written by prepareHome().
    env: {
      ...process.env,
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      LANG: 'en_US.UTF-8',
    } as Record<string, string>,
    timeout: 120_000,
  });
  if (process.env.LOGSEQ_DEBUG) {
    app.process().stdout?.pipe(process.stdout);
    app.process().stderr?.pipe(process.stderr);
  }

  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  step('window loaded, waiting for API server');
  try {
    await ensureApiServer(win);
    step(`API server up, preparing ${variant} graph`);
    if (variant === 'file') {
      await loadFileGraph(win, home);
    } else {
      await seedDbGraph();
    }
  } catch (e) {
    await win.screenshot({ path: 'logseq-setup-failure.png' }).catch(() => {});
    await closeApp();
    throw e;
  }

  const info = await callApi('logseq.App.getAppInfo');
  step(`${variant} variant ready, version ${info?.version}`);

  project.provide('logseqVariant', variant);
  project.provide('logseqApi', `http://${API_HOST}:${API_PORT}`);
  project.provide('logseqToken', API_TOKEN);

  return async () => {
    step('closing');
    await closeApp();
    fs.rmSync(home, { recursive: true, force: true });
  };
}
