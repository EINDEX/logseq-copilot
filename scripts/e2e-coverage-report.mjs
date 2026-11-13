#!/usr/bin/env node
// Merge the E2E coverage dumps (tests/e2e/coverage.ts) into one report:
// test-results/e2e-coverage/lcov.info, with repo-relative `src/...` paths so
// Codecov merges it with the unit coverage (flag `e2e`, integration.yml).
//
// Usage: node scripts/e2e-coverage-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';
import libReport from 'istanbul-lib-report';
import libSourceMaps from 'istanbul-lib-source-maps';
import reports from 'istanbul-reports';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'test-results/e2e-coverage');
const RAW_DIR = path.join(OUT_DIR, 'raw');

const files = fs.existsSync(RAW_DIR) ? fs.readdirSync(RAW_DIR).filter((f) => f.endsWith('.json')) : [];
if (!files.length) {
  console.error(`no coverage dumps in ${RAW_DIR}; run the E2E tests with E2E_COVERAGE=true`);
  process.exit(1);
}

const raw = libCoverage.createCoverageMap({});
for (const file of files) raw.merge(JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), 'utf8')));

// The instrumented code is Vite's output for each module; its input source
// map leads back to the lines of the .ts/.tsx file.
const remapped = await libSourceMaps.createSourceMapStore().transformCoverage(raw);

const coverage = libCoverage.createCoverageMap({});
for (const file of remapped.files()) {
  const relative = path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join('/');
  if (!relative.startsWith('src/')) continue;
  coverage.merge({ [relative]: { ...remapped.fileCoverageFor(file).toJSON(), path: relative } });
}

const context = libReport.createContext({ dir: OUT_DIR, coverageMap: coverage, defaultSummarizer: 'nested' });
for (const name of ['lcovonly', 'json-summary', 'text-summary']) {
  reports.create(name, { file: name === 'lcovonly' ? 'lcov.info' : undefined }).execute(context);
}
console.log(`${files.length} dumps, ${coverage.files().length} files -> ${path.relative(ROOT, OUT_DIR)}/lcov.info`);
