/**
 * Boots a real Logseq desktop app (under Xvfb on CI) with its HTTP API server
 * enabled, loads a test graph and seeds data, so integration tests can talk to
 * it exactly like the extension does. The launcher is shared with the E2E
 * tests, see tests/support/logseq-app.ts.
 *
 * Env:
 *   LOGSEQ_VARIANT   file | db
 *   LOGSEQ_BIN       path to the Logseq executable
 *                    (see scripts/download-logseq.sh)
 *   LOGSEQ_API_PORT  API server port (default 12315)
 */
import type { TestProject } from 'vitest/node';
import { optionsFromEnv, startLogseq } from '../support/logseq-app';

declare module 'vitest' {
  export interface ProvidedContext {
    logseqVariant: 'file' | 'db';
    logseqApi: string;
    logseqToken: string;
  }
}

export default async function setup(project: TestProject) {
  const logseq = await startLogseq(optionsFromEnv());

  project.provide('logseqVariant', logseq.variant);
  project.provide('logseqApi', logseq.apiUrl);
  project.provide('logseqToken', logseq.token);

  return () => logseq.close();
}
