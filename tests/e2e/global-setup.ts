/**
 * Starts one Logseq for the whole E2E run (shared launcher, see
 * tests/support/logseq-app.ts) and hands its connection details to the tests
 * through E2E_LOGSEQ. The returned function is the global teardown.
 *
 * Env: LOGSEQ_VARIANT, LOGSEQ_BIN, LOGSEQ_API_PORT, LOGSEQ_DEBUG.
 */
import path from 'node:path';
import { optionsFromEnv, startLogseq } from '../support/logseq-app';
import type { LogseqInfo } from './fixtures';

export default async function globalSetup() {
  const logseq = await startLogseq({
    ...optionsFromEnv(),
    failureScreenshot: path.resolve(__dirname, '../../test-results/e2e/logseq-setup-failure.png'),
  });
  const info: LogseqInfo = {
    variant: logseq.variant,
    host: logseq.host,
    port: logseq.port,
    token: logseq.token,
    apiUrl: logseq.apiUrl,
    graph: logseq.graph,
    version: logseq.version,
  };
  process.env.E2E_LOGSEQ = JSON.stringify(info);
  return () => logseq.close();
}
