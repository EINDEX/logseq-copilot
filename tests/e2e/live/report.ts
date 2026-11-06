/**
 * Playwright reporter of the live site check: collects the result each site
 * test attaches (the last attempt counts) and writes REPORT_DIR/results.json
 * and results.md, the table site-check.yml puts into the job summary and the
 * issue.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { builtInEngines, FAILING, QUERY, redact, REPORT_DIR, selectedEngines, type SiteResult, type Status } from './sites';

const STATUSES: Status[] = ['ok', 'degraded', 'blocked', 'broken', 'skipped'];

export interface Report {
  query: string;
  generatedAt: string;
  /** Every built-in engine has a result. */
  complete: boolean;
  /** Some site is broken or degraded. */
  failed: boolean;
  sites: SiteResult[];
}

/** Longest text in a table cell. */
export const CELL_MAX = 300;
/** Longest note: it lists everything the check found on a broken page. */
export const NOTE_MAX = 600;
/** Longest results.md: the issue body (65536 at most) is it and a line. */
export const REPORT_MAX = 60_000;

/**
 * `text` as a code span for a table cell, '' when empty. The notes and URLs
 * hold what the sites show (titles, addresses, console messages; anyone can
 * run a SearX instance): in a code span, links, images, HTML, @mentions and
 * #references do not render. A backtick would end the span (it becomes
 * `'`), a line break the row, `|` the cell (escaped, also in a code span).
 */
export function code(text: string, max = CELL_MAX): string {
  const chars = [...text.replace(/`/g, "'").replace(/\s+/g, ' ').trim()];
  const cut = chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
  return cut ? `\`${cut.replace(/\|/g, '\\|')}\`` : '';
}

export function markdown(report: Report): string {
  const counts = STATUSES.map((status) => [status, report.sites.filter((s) => s.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${status}`)
    .join(', ');
  const head = [
    '### Search engine adapters on the live sites',
    '',
    `Query ${code(report.query)}: ${counts}.${report.complete ? '' : ' Not every site was checked.'}`,
    '',
    '| Site | Status | Note | Result page |',
    '| --- | --- | --- | --- |',
  ];
  const foot = [
    '',
    '`blocked`: captcha, consent, challenge or error page, not an adapter fault. ' +
      '`broken`: the page loaded without the card and its results, or with the card out of place. ' +
      '`degraded`: the card is in a fallback place. ' +
      'Statuses and evidence: tests/e2e/README.md, "Live site check".',
    '',
  ];
  // Whole rows up to REPORT_MAX (a cut row could open a code span it does
  // not close); room for the line that counts the rows left out.
  let size = [...head, ...foot].join('\n').length + 100;
  const rows: string[] = [];
  for (const site of report.sites) {
    const status = FAILING.includes(site.status) ? `**${site.status}**` : site.status;
    const row = `| ${code(site.name)} | ${status} | ${code(site.note, NOTE_MAX)} | ${code(site.url)} |`;
    size += row.length + 1;
    if (size > REPORT_MAX) break;
    rows.push(row);
  }
  const left = report.sites.length - rows.length;
  if (left) foot.splice(1, 0, `${left} more sites are only in results.json (artifact \`site-check\`).`, '');
  return [...head, ...rows, ...foot].join('\n');
}

export default class SiteCheckReporter implements Reporter {
  private results = new Map<string, { result: SiteResult; earlier: SiteResult[] }>();
  private cleared = false;

  onTestBegin() {
    // Screenshots of an earlier run would stay next to the new results.
    // Not in onBegin: `--list` calls it too and would delete the last results.
    if (this.cleared) return;
    this.cleared = true;
    fs.rmSync(REPORT_DIR, { recursive: true, force: true });
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const id = test.annotations.find((a) => a.type === 'site')?.description ?? test.title;
    const attachment = result.attachments.find((a) => a.name === 'site-check' && a.body);
    const site: SiteResult = attachment
      ? JSON.parse(attachment.body!.toString())
      : {
          id,
          name: test.title,
          status: 'broken',
          note: redact(`the check did not finish: ${(result.error?.message ?? result.status).split('\n')[0]}`),
          url: '',
        };
    const seen = this.results.get(id);
    this.results.set(id, { result: site, earlier: seen ? [...seen.earlier, seen.result] : [] });
  }

  onEnd(_result: FullResult) {
    const order = builtInEngines().map((engine) => engine.id);
    const sites = [...this.results.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([, { result, earlier }]) => {
        const before = earlier.filter((e) => e.status !== result.status);
        if (!before.length) return result;
        const first = before[0];
        return { ...result, note: `${result.note} (first attempt ${first.status}: ${first.note})` };
      });
    if (sites.length === 0) {
      console.log('\nSite check: no site was checked (see the errors above).');
      return;
    }
    const report: Report = {
      query: QUERY,
      generatedAt: new Date().toISOString(),
      complete: selectedEngines().complete && sites.length === order.length,
      failed: sites.some((site) => FAILING.includes(site.status)),
      sites,
    };
    const md = markdown(report);
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(REPORT_DIR, 'results.md'), md);
    console.log(`\n${md}\nResults and screenshots: ${path.relative(process.cwd(), REPORT_DIR)}/`);
  }

  printsToStdio() {
    return false;
  }
}
