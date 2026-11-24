#!/usr/bin/env node
// Rewrites src/locales/*.json in their canonical form: keys sorted at every
// level, two-space indent, a final newline (src/locales/README.md).
// src/locales/locales.test.ts fails on a file that is not in it.
//
// Usage: node scripts/format-locales.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/locales',
);

const sortKeys = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, sortKeys(value[key])]),
      )
    : value;

for (const name of readdirSync(dir).filter((file) => file.endsWith('.json'))) {
  const file = path.join(dir, name);
  const text = `${JSON.stringify(
    sortKeys(JSON.parse(readFileSync(file, 'utf8'))),
    null,
    2,
  )}\n`;
  writeFileSync(file, text);
}
