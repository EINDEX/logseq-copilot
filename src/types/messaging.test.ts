/**
 * Static guards for the messaging layer.
 *
 * 1. Every key of MessagingProtocol has a receiver (`onMessage`) and a sender
 *    (`sendMessage`) somewhere in src. A message nobody handles, or nobody
 *    sends, is dead or broken wiring.
 * 2. Nothing bypasses @webext-core/messaging with raw runtime messaging: its
 *    receivers drop anything without `type` + `timestamp`, so hand-rolled
 *    messages silently never arrive.
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

const listSourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });

const files = listSourceFiles(SRC).map((file) => ({
  rel: path.relative(SRC, file),
  text: fs.readFileSync(file, 'utf8'),
}));

const protocolKeys = (() => {
  const text = fs.readFileSync(path.join(SRC, 'types/messaging.ts'), 'utf8');
  const body = text.slice(
    text.indexOf('export interface MessagingProtocol'),
    text.indexOf('// Create the messaging instance'),
  );
  return [...body.matchAll(/^\s{2}'([\w:]+)'\s*:/gm)].map((m) => m[1]);
})();

describe('messaging protocol', () => {
  test('the protocol was parsed', () => {
    expect(protocolKeys).toContain('logseq:changeBlockMarker');
    expect(protocolKeys.length).toBeGreaterThan(5);
  });

  test.each(protocolKeys)('%s has a receiver and a sender', (key) => {
    const uses = (fn: 'onMessage' | 'sendMessage') =>
      files
        .filter((f) => f.rel !== path.join('types', 'messaging.ts'))
        .filter((f) => new RegExp(`\\b${fn}\\(\\s*'${key}'`).test(f.text))
        .map((f) => f.rel);

    expect(uses('onMessage'), `no onMessage('${key}')`).not.toEqual([]);
    expect(uses('sendMessage'), `no sendMessage('${key}')`).not.toEqual([]);
  });

  test('message names used in code are all declared in the protocol', () => {
    const used = files.flatMap((f) =>
      [...f.text.matchAll(/\b(?:onMessage|sendMessage)\(\s*'([\w]+:[\w]+)'/g)].map(
        (m) => m[1],
      ),
    );
    expect(used.filter((k) => !protocolKeys.includes(k))).toEqual([]);
  });
});

describe('no raw runtime messaging', () => {
  // Files allowed to use the raw API, with the reason. Keep this empty unless
  // there is a real need.
  const ALLOWED: Record<string, string> = {};

  const RAW = /\b(?:runtime\.sendMessage|runtime\.onMessage|tabs\.sendMessage)\b/;

  test('browser.runtime.sendMessage / runtime.onMessage / tabs.sendMessage are not used', () => {
    const offenders = files
      .filter((f) => !(f.rel in ALLOWED))
      .filter((f) => RAW.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
