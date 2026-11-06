/**
 * Checks that results.md (report.ts) shows what the sites put into notes and
 * URLs as code only: no row or cell of their own, no link, image, HTML,
 * @mention or #reference; and the length limits. No network.
 *
 *   node tests/e2e/live/report.check.cjs [table.md]
 *
 * With a path it also writes the hostile table there, to render it with
 * GitHub by hand:
 *
 *   gh api markdown -f mode=gfm -f context=EINDEX/logseq-copilot -F text=@table.md
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// report.ts and sites.ts as Playwright loads them: CommonJS, imports
// without extensions (Node's own TypeScript support resolves neither).
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(outputText, filename);
};
const { CELL_MAX, NOTE_MAX, REPORT_MAX, code, markdown } = require('./report.ts');

/** What a result page (its title, URL, console) can put into a note. */
const HOSTILE = [
  '[link](https://evil.example/a)',
  '![pixel](https://evil.example/pixel.png)',
  '<img src=x onerror=alert(1)>',
  '<a href="https://evil.example/b">html link</a> <details open><summary>s</summary>d</details>',
  'hi @octocat',
  '#1, EINDEX/logseq-copilot#2, GH-3, commit 9589ef8d3fdb3d2ffa0a0295243ea19c0886ed0d',
  'https://evil.example/autolink www.evil.example',
  'ends the span ` [x](https://evil.example/c) ` and ``` a fence',
  'splits | the | row | apart |',
  'escaped \\| pipe, trailing backslash \\',
  'line\n| injected | row | x | y |\n\n# heading\r\nmore',
  ':+1: &#96;entity&#96; &lt;img src=x&gt;',
];

const site = (i, fields) => ({ id: `s${i}`, name: `Site ${i}`, status: 'broken', note: '', url: '', ...fields });
const report = (sites) => ({ query: 'copilot', generatedAt: '', complete: true, failed: true, sites });
/** Text without its code spans: what GitHub renders as Markdown. */
const outsideCode = (md) => md.replace(/`[^`]*`/g, '');
/** A table row's cells, split where GitHub splits them (at `|` without `\`). */
const cells = (row) => row.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
const SPAN = /^`[^`\n]+`$/;
let checks = 0;
const ok = (value, message) => {
  assert.ok(value, message);
  checks++;
};

function checkTable(md, sites) {
  const lines = md.split('\n');
  const first = lines.findIndex((l) => l.startsWith('|'));
  const rows = lines.slice(first).filter((l) => l.startsWith('|'));
  ok(rows.length === sites + 2, `${sites} rows under the header, got ${rows.length - 2}`);
  ok(lines.slice(first, first + rows.length).every((l) => l.startsWith('|')), 'the rows are one block');
  for (const row of rows.slice(2)) {
    const [name, status, note, url] = cells(row);
    ok(cells(row).length === 4, `4 cells: ${row.slice(0, 200)}`);
    ok(/^(\*\*)?(ok|degraded|blocked|broken|skipped)(\*\*)?$/.test(status), `status cell: ${status}`);
    for (const cell of [name, note, url]) ok(cell === '' || SPAN.test(cell), `one code span: ${cell.slice(0, 200)}`);
  }
  const rest = outsideCode(md);
  ok(!/[[\]<>@!]|https?:|www\./.test(rest), `no Markdown or HTML outside code: ${rest.match(/.{0,40}[[\]<>@!].{0,40}/)?.[0]}`);
  ok(rest.split('\n').every((l, i) => i === 0 || !l.includes('#')), 'no # but the heading');
  ok(md.length <= REPORT_MAX, `results.md ${md.length} > ${REPORT_MAX}`);
}

// Each hostile text as name, note and URL, and all of them in a note that
// is cut.
const hostile = report([
  ...HOSTILE.map((text, i) => site(i, { name: text, note: text, url: text })),
  site(HOSTILE.length, { note: HOSTILE.join(' ').repeat(2), url: 'https://kagi.com/search?q=copilot' }),
  site(HOSTILE.length + 1, { status: 'skipped', note: '', url: '' }),
]);
const md = markdown(hostile);
checkTable(md, hostile.sites.length);

// Cut to the limit, ending in `…`, a pair of surrogates kept whole.
const plain = (cell) => cell.slice(1, -1).replace(/\\\|/g, '|');
ok([...plain(code('a'.repeat(5000)))].length === CELL_MAX, 'a cell is cut to CELL_MAX');
ok(plain(code('a'.repeat(5000))).endsWith('…'), 'a cut cell ends in …');
ok([...plain(code('x'.repeat(5000), NOTE_MAX))].length === NOTE_MAX, 'a note is cut to NOTE_MAX');
ok(code('a'.repeat(CELL_MAX)) === `\`${'a'.repeat(CELL_MAX)}\``, 'a cell of CELL_MAX is whole');
ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(code('😀'.repeat(1000))), 'no lone surrogate');
ok(code('  \n ') === '' && code('') === '', 'blank is an empty cell');

// Many long rows: whole rows up to REPORT_MAX and a line for the others.
const pipes = '|'.repeat(5000);
const big = report(Array.from({ length: 400 }, (_, i) => site(i, { name: pipes, note: pipes, url: pipes })));
const bigMd = markdown(big);
const shown = bigMd.split('\n').filter((l) => l.startsWith('|')).length - 2;
ok(shown > 0 && shown < 400, `some rows fit: ${shown}`);
ok(bigMd.includes(`${400 - shown} more sites are only in results.json`), 'the rows left out are counted');
checkTable(bigMd, shown);

if (process.argv[2]) fs.writeFileSync(process.argv[2], md);
console.log(`report.check: ${checks} checks passed${process.argv[2] ? `, table in ${process.argv[2]}` : ''}`);
