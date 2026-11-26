// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const { scripts } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

describe('package.json browser scripts', () => {
  it.each([
    ['build:safari', 'wxt build -b safari'],
    ['zip:safari', 'wxt zip -b safari'],
    ['release:safari', 'bash scripts/safari-release.sh'],
    ['build:firefox', 'wxt build -b firefox'],
    ['zip:edge', 'wxt zip -b edge'],
  ])('%s runs %s', (name, command) => {
    expect(scripts[name]).toBe(command);
  });
});
