/**
 * Logging rules.
 *
 * 1. src/ never calls console.* directly; everything goes through the logger
 *    (utils/logger.ts), which is the one place that decides what is printed.
 *    Debug output is dev-only, so user content logged at debug level (page
 *    highlights with notes, search results) never reaches packaged builds.
 * 2. The logger gates debug on `import.meta.env.DEV`, which Vite replaces with
 *    a literal so the debug branch is removed from production bundles.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import log from './logger';

const SRC = path.resolve(__dirname, '..');

const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

describe('no direct console calls', () => {
  // The logger itself is the only place allowed to call console.*; test files
  // may spy on it.
  const ALLOWED = (rel: string) =>
    rel === path.join('utils', 'logger.ts') || /\.test\.tsx?$/.test(rel);

  const CONSOLE = /\bconsole\s*\.\s*(log|debug|info|warn|error|trace)\s*\(/;

  test('src/ uses the logger instead of console.*', () => {
    const offenders = listSourceFiles(SRC)
      .map((file) => ({
        rel: path.relative(SRC, file),
        lines: fs.readFileSync(file, 'utf8').split('\n'),
      }))
      .filter((f) => !ALLOWED(f.rel))
      .flatMap((f) =>
        f.lines
          .map((line, i) => (CONSOLE.test(line) ? `${f.rel}:${i + 1}` : ''))
          .filter(Boolean),
      );
    expect(offenders).toEqual([]);
  });

  test('the logger gates debug on import.meta.env.DEV only', () => {
    const text = fs.readFileSync(path.join(SRC, 'utils/logger.ts'), 'utf8');
    expect(text).toContain('import.meta.env.DEV');
    expect(text).not.toContain('WXT_ENV');
  });
});

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test('info, warn and error always print with the prefix', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    log.info('a');
    log.warn('b');
    log.error('c');

    expect(info).toHaveBeenCalledWith('[Logseq Copilot]', 'a');
    expect(warn).toHaveBeenCalledWith('[Logseq Copilot]', 'b');
    expect(error).toHaveBeenCalledWith('[Logseq Copilot]', 'c');
  });

  test('debug prints in development', () => {
    vi.stubEnv('DEV', true);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    log.debug('x');
    expect(debug).toHaveBeenCalledWith('[Logseq Copilot]', 'x');
  });

  test('debug is silent outside development (packaged build)', () => {
    vi.stubEnv('DEV', false);
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    log.debug('x');
    expect(debug).not.toHaveBeenCalled();
  });
});
