// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MAX,
  GATE_CONTEXT,
  GateError,
  STORE_LINKS_FILE,
  evaluate,
  fetchChrome,
  fetchEdge,
  fetchFirefox,
  hasSkipLabel,
  isReleasePr,
  parseAmoAddon,
  parseChromeStatus,
  parseEdgeDetails,
  parseLatestRelease,
  parseStoreLinks,
  readStores,
  storeIdsFromLinks,
} from '../../pipeline/store-gate.mjs';
import { main, parseArgs } from '../../pipeline/stores-in-sync.mjs';

const fixture = (name) =>
  readFileSync(
    new URL(`./fixtures/store-gate/${name}`, import.meta.url),
    'utf8',
  );
const json = (name) => JSON.parse(fixture(name));
const stores = parseStoreLinks(readFileSync(STORE_LINKS_FILE, 'utf8'));

const EDGE_ID = 'ebigopegbohijaikegebaaboaomaifoi';
const CHROME_ID = 'hihgfcgbmnbomabfdbajlbpnacndeihl';
const REPO = 'EINDEX/logseq-copilot';
const RELEASE_BRANCH =
  'release-please--branches--main--components--logseq-copilot';

const listed = (published, pending = undefined) => ({
  ok: true,
  published,
  pending,
  notes: [],
});
const failed = (kind, message) => ({
  ok: false,
  error: new GateError(message, { kind }),
});
const expected = (version) => ({ ok: true, version });

/**
 * A fetch that answers by URL. `routes` maps a URL substring to a response
 * ({ status, body | json }) or to an Error to throw.
 */
function mockFetch(routes) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    requests.push({
      url,
      method: init.method ?? 'GET',
      headers: new Headers(init.headers),
      body: init.body,
    });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key)
      throw new Error(`unexpected request ${init.method ?? 'GET'} ${url}`);
    let route = routes[key];
    if (typeof route === 'function') route = route(url, init);
    if (route instanceof Error) throw route;
    const body =
      route.json !== undefined ? JSON.stringify(route.json) : route.body ?? '';
    return new Response(body, { status: route.status ?? 200 });
  };
  return { fetch, requests };
}

const chromeEnv = {
  CHROME_PUBLISHER_ID: 'publisher-id',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret-value',
  GOOGLE_REFRESH_TOKEN: 'refresh-token-value',
};

const storeRoutes = ({
  chrome = 'chrome-published.json',
  release = 'v2.2.0',
} = {}) => ({
  'api.github.com/repos/EINDEX/logseq-copilot/releases/latest': {
    json: { tag_name: release },
  },
  'oauth2.googleapis.com/token': {
    json: { access_token: 'access-token-value', expires_in: 3599 },
  },
  'chromewebstore.googleapis.com': { body: fixture(chrome) },
  'addons.mozilla.org': { body: fixture('amo-addon.json') },
  getproductdetailsbycrxid: { body: fixture('edge-product-details.json') },
});

describe('store ids', () => {
  it('come from the website store links', () => {
    expect(stores.map((s) => s.id)).toEqual(['chrome', 'firefox', 'edge']);
    expect(storeIdsFromLinks(stores)).toEqual({
      chrome: CHROME_ID,
      edge: EDGE_ID,
      firefox: 'logseq-copilot',
    });
  });

  it('match the Chrome extension id that publish.yml uploads to', () => {
    const publish = readFileSync(
      new URL('../../.github/workflows/publish.yml', import.meta.url),
      'utf8',
    );
    expect(publish).toMatch(
      new RegExp(`extension-id: '${storeIdsFromLinks(stores).chrome}'`),
    );
  });

  it('reject a link without an id', () => {
    expect(() =>
      storeIdsFromLinks([
        ...stores.filter((s) => s.id !== 'edge'),
        { id: 'edge', href: 'https://microsoftedge.microsoft.com/addons/' },
      ]),
    ).toThrow(/Edge item id/);
  });
});

describe('parsers', () => {
  it('reads the latest release tag', () => {
    expect(parseLatestRelease({ tag_name: 'v2.2.0' })).toBe('2.2.0');
    expect(() => parseLatestRelease({ tag_name: 'preview' })).toThrow(
      GateError,
    );
  });

  it('reads the published Chrome version', () => {
    expect(parseChromeStatus(json('chrome-published.json'))).toEqual({
      published: '2.2.0',
      pending: null,
      notes: [],
    });
  });

  it('reads a Chrome submission in review', () => {
    expect(parseChromeStatus(json('chrome-in-review.json'))).toEqual({
      published: '2.1.0',
      pending: { version: '2.2.0', state: 'PENDING_REVIEW' },
      notes: [],
    });
  });

  it('takes the Chrome version most users get during a staged rollout', () => {
    const status = json('chrome-published.json');
    status.publishedItemRevisionStatus.distributionChannels = [
      { deployPercentage: 90, crxVersion: '2.1.0' },
      { deployPercentage: 10, crxVersion: '2.2.0' },
    ];
    expect(parseChromeStatus(status)).toMatchObject({
      published: '2.1.0',
      notes: ['2.2.0 rolled out to 10%'],
    });
  });

  it('lists nothing for a Chrome item that was taken down', () => {
    expect(
      parseChromeStatus({ ...json('chrome-published.json'), takenDown: true }),
    ).toMatchObject({ published: null });
  });

  it('rejects a Chrome response it does not understand', () => {
    expect(() => parseChromeStatus({ error: { code: 403 } })).toThrow(
      /no itemId/,
    );
  });

  it('reads the AMO version', () => {
    expect(parseAmoAddon(json('amo-addon.json'))).toEqual({
      published: '2.2.0',
      pending: undefined,
      notes: [],
    });
  });

  it('reads the Edge version from the store page data', () => {
    expect(
      parseEdgeDetails(fixture('edge-product-details.json'), EDGE_ID),
    ).toMatchObject({ published: '2.2.0' });
  });

  it('reports a parse failure when the Edge store page changes', () => {
    const html = () =>
      parseEdgeDetails(fixture('edge-page-changed.html'), EDGE_ID);
    expect(html).toThrow(/not JSON, the store page has changed/);
    expect(html).toThrow(expect.objectContaining({ kind: 'parse' }));

    const { version, ...noVersion } = json('edge-product-details.json');
    expect(version).toBe('2.2.0');
    expect(() => parseEdgeDetails(JSON.stringify(noVersion), EDGE_ID)).toThrow(
      /no version/,
    );
    expect(() =>
      parseEdgeDetails(fixture('edge-product-details.json'), 'a'.repeat(32)),
    ).toThrow(/is for/);
  });
});

describe('evaluate', () => {
  it('passes when every store lists the latest release', () => {
    const result = evaluate({
      expected: expected('2.2.0'),
      results: {
        chrome: listed('2.2.0', null),
        edge: listed('2.2.0'),
        firefox: listed('2.2.0'),
      },
    });
    expect(result.state).toBe('success');
    expect(result.description).toBe('Chrome, Edge and Firefox all list 2.2.0');
  });

  it('fails when a store is behind, naming the store and both versions', () => {
    const result = evaluate({
      expected: expected('2.2.0'),
      results: {
        chrome: listed('2.2.0', null),
        edge: listed('2.1.0'),
        firefox: listed('2.2.0'),
      },
    });
    expect(result.state).toBe('failure');
    expect(result.description).toBe('Expected 2.2.0: Edge lists 2.1.0');
    expect(result.lines).toContain(
      '- Edge: lists 2.1.0, expected 2.2.0, **behind**, in review: unknown (public data only)',
    );
  });

  it('fails while a submission is in review, and says so', () => {
    const chrome = {
      ok: true,
      ...parseChromeStatus(json('chrome-in-review.json')),
    };
    const result = evaluate({
      expected: expected('2.2.0'),
      results: { chrome, edge: listed('2.2.0'), firefox: listed('2.2.0') },
    });
    expect(result.state).toBe('failure');
    expect(result.description).toBe(
      'Expected 2.2.0: Chrome lists 2.1.0, 2.2.0 in review',
    );
    expect(result.lines).toContain(
      '- Chrome: lists 2.1.0, expected 2.2.0, **behind**, in review: 2.2.0 (in review)',
    );
  });

  it('is an error, not a pass, when the Edge page cannot be parsed', () => {
    let edge;
    try {
      parseEdgeDetails(fixture('edge-page-changed.html'), EDGE_ID);
    } catch (error) {
      edge = { ok: false, error };
    }
    const result = evaluate({
      expected: expected('2.2.0'),
      results: {
        chrome: listed('2.2.0', null),
        edge,
        firefox: listed('2.2.0'),
      },
    });
    expect(result.state).toBe('error');
    expect(result.description).toBe(
      'Check error, not a store lag: Edge parse failed',
    );
    expect(result.lines.join('\n')).toMatch(
      /Edge: \*\*parse failed\*\* \(parse\): Edge store data is not JSON/,
    );
  });

  it('is an error when an API call fails', () => {
    const result = evaluate({
      expected: expected('2.2.0'),
      results: {
        chrome: failed('api', 'Chrome fetchStatus: HTTP 503'),
        edge: listed('2.2.0'),
        firefox: listed('2.2.0'),
      },
    });
    expect(result.state).toBe('error');
    expect(result.description).toBe(
      'Check error, not a store lag: Chrome check error',
    );
  });

  it('is an error when the latest release cannot be read', () => {
    const result = evaluate({
      expected: {
        ok: false,
        error: new GateError('GitHub latest release: HTTP 502', {
          kind: 'api',
        }),
      },
      results: {
        chrome: listed('2.2.0', null),
        edge: listed('2.2.0'),
        firefox: listed('2.2.0'),
      },
    });
    expect(result.state).toBe('error');
    expect(result.description).toMatch(
      /^Check error, not a store lag: latest release: GitHub latest release: HTTP 502/,
    );
  });

  it('still fails on a store that is behind when another check errors', () => {
    const result = evaluate({
      expected: expected('2.2.0'),
      results: {
        chrome: failed('network', 'timeout'),
        edge: listed('2.1.0'),
        firefox: listed('2.2.0'),
      },
    });
    expect(result.state).toBe('failure');
    expect(result.description).toBe(
      'Expected 2.2.0: Edge lists 2.1.0; check error: Chrome check error',
    );
  });

  it('passes with the skip label and says what it would have been', () => {
    const result = evaluate({
      expected: expected('2.2.0'),
      results: {
        chrome: listed('2.1.0', { version: '2.2.0', state: 'PENDING_REVIEW' }),
        edge: listed('2.1.0'),
        firefox: listed('2.2.0'),
      },
      skip: true,
    });
    expect(result.state).toBe('success');
    expect(result.verdict).toBe('failure');
    expect(result.description).toMatch(
      /^Skipped \(skip-store-gate label\)\. Would be failure: Expected 2\.2\.0: Chrome lists 2\.1\.0/,
    );
    expect(result.lines[0]).toBe(
      '- **Skipped** by the `skip-store-gate` label. Without it: failure.',
    );
  });

  it('keeps the description within the commit status limit', () => {
    const long = 'x'.repeat(300);
    const result = evaluate({
      expected: expected('2.2.0'),
      results: {
        chrome: failed('api', long),
        edge: listed(long),
        firefox: listed(long),
      },
      skip: true,
    });
    expect(result.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(result.description.endsWith('…')).toBe(true);
  });
});

describe('pull requests', () => {
  const pr = (ref, repo = REPO, labels = []) => ({
    head: { ref, repo: { full_name: repo } },
    labels,
  });

  it('knows release-please PRs from this repository', () => {
    expect(isReleasePr(pr(RELEASE_BRANCH), REPO)).toBe(true);
    expect(isReleasePr(pr('feat/x'), REPO)).toBe(false);
    expect(isReleasePr(pr(RELEASE_BRANCH, 'someone/fork'), REPO)).toBe(false);
  });

  it('reads the skip label', () => {
    expect(
      hasSkipLabel(
        pr(RELEASE_BRANCH, REPO, [
          { name: 'autorelease: pending' },
          { name: 'skip-store-gate' },
        ]),
      ),
    ).toBe(true);
    expect(
      hasSkipLabel(
        pr(RELEASE_BRANCH, REPO, [{ name: 'autorelease: pending' }]),
      ),
    ).toBe(false);
  });
});

describe('store requests', () => {
  it('only read: one token exchange, then GETs', async () => {
    const { fetch, requests } = mockFetch(storeRoutes());
    const { expected: release, results } = await readStores({
      fetch,
      ids: storeIdsFromLinks(stores),
      repository: REPO,
      env: { ...chromeEnv, GITHUB_TOKEN: 'gh-token' },
    });
    expect(release).toEqual({ ok: true, version: '2.2.0' });
    expect(results.chrome).toMatchObject({
      ok: true,
      published: '2.2.0',
      pending: null,
    });
    expect(results.edge).toMatchObject({ ok: true, published: '2.2.0' });
    expect(results.firefox).toMatchObject({ ok: true, published: '2.2.0' });

    const writes = requests.filter((r) => r.method !== 'GET');
    expect(writes.map((r) => r.url)).toEqual([
      'https://oauth2.googleapis.com/token',
    ]);
    const status = requests.find((r) => r.url.includes('chromewebstore'));
    expect(status.url).toBe(
      `https://chromewebstore.googleapis.com/v2/publishers/publisher-id/items/${CHROME_ID}:fetchStatus`,
    );
    expect(status.headers.get('authorization')).toBe(
      'Bearer access-token-value',
    );
  });

  it('turns an HTTP error into an api error without the credentials', async () => {
    const { fetch } = mockFetch({
      'oauth2.googleapis.com/token': {
        status: 400,
        json: { error: 'invalid_grant' },
      },
    });
    const error = await fetchChrome({
      fetch,
      itemId: CHROME_ID,
      ...{
        publisherId: 'p',
        clientId: 'c',
        clientSecret: 'client-secret-value',
        refreshToken: 'refresh-token-value',
      },
    }).catch((e) => e);
    expect(error).toMatchObject({ kind: 'api' });
    expect(error.message).toBe(
      'Google OAuth token: HTTP 400 {"error":"invalid_grant"}',
    );
    expect(error.message).not.toMatch(
      /client-secret-value|refresh-token-value/,
    );
  });

  it('turns a failed request into a network error', async () => {
    const { fetch } = mockFetch({
      'addons.mozilla.org': new TypeError('fetch failed'),
    });
    await expect(
      fetchFirefox({ fetch, slug: 'logseq-copilot' }),
    ).rejects.toMatchObject({
      kind: 'network',
      message: 'AMO add-on: request failed (fetch failed)',
    });
  });

  it('reports a parse failure for an Edge page that changed', async () => {
    const { fetch } = mockFetch({
      getproductdetailsbycrxid: { body: fixture('edge-page-changed.html') },
    });
    await expect(fetchEdge({ fetch, crxId: EDGE_ID })).rejects.toMatchObject({
      kind: 'parse',
    });
  });

  it('needs the Chrome credentials', async () => {
    const { fetch, requests } = mockFetch({});
    await expect(
      fetchChrome({ fetch, itemId: CHROME_ID }),
    ).rejects.toMatchObject({
      kind: 'config',
      message: 'CHROME_PUBLISHER_ID is not set',
    });
    expect(requests).toEqual([]);
  });
});

describe('stores-in-sync.mjs', () => {
  const releasePr = {
    number: 175,
    state: 'open',
    base: { ref: 'main' },
    head: {
      ref: RELEASE_BRANCH,
      sha: 'a'.repeat(40),
      repo: { full_name: REPO },
    },
    labels: [{ name: 'autorelease: pending' }],
  };
  const featurePr = {
    number: 160,
    state: 'open',
    base: { ref: 'main' },
    head: { ref: 'fix/x', sha: 'b'.repeat(40), repo: { full_name: REPO } },
    labels: [],
  };

  function github({ prs, statuses = {}, chrome } = {}) {
    const posted = [];
    const routes = {
      ...storeRoutes({ chrome }),
      '/pulls?state=open': { json: prs },
      '/pulls/': (url) => ({
        json: prs.find((pr) => url.endsWith(`/pulls/${pr.number}`)),
      }),
      '/statuses?per_page=100': (url) => ({
        json: statuses[url.match(/commits\/(\w+)\//)[1]] ?? [],
      }),
      '/statuses/': (url, init) => {
        posted.push({ sha: url.split('/').at(-1), ...JSON.parse(init.body) });
        return { status: 201, json: {} };
      },
    };
    return { ...mockFetch(routes), posted };
  }

  const env = (dir) => ({
    ...chromeEnv,
    GITHUB_TOKEN: 'gh-token',
    GITHUB_REPOSITORY: REPO,
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_RUN_ID: '42',
    GITHUB_OUTPUT: join(dir, 'output'),
    GITHUB_STEP_SUMMARY: join(dir, 'summary'),
  });
  const quiet = () => {};

  it('parses its arguments', () => {
    expect(parseArgs(['check', '--pr', '12,13', '--dry-run'])).toEqual({
      mode: 'check',
      prs: [12, 13],
      dryRun: true,
    });
    expect(() => parseArgs(['check', '--pr', '1;rm'])).toThrow(/PR numbers/);
    expect(() => parseArgs(['post'])).toThrow(/usage/);
  });

  it('route: marks other PRs as passing once and lists the release PRs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    const { fetch, posted, requests } = github({ prs: [releasePr, featurePr] });
    expect(await main(['route'], env(dir), { fetch, log: quiet })).toBe(0);
    expect(posted).toEqual([
      {
        sha: featurePr.head.sha,
        state: 'success',
        context: GATE_CONTEXT,
        description:
          'Not a release PR: the store gate only applies to release-please PRs',
        target_url: 'https://github.com/EINDEX/logseq-copilot/actions/runs/42',
      },
    ]);
    expect(readFileSync(join(dir, 'output'), 'utf8')).toBe('release_prs=175\n');
    expect(
      requests.some((r) =>
        /chromewebstore|addons\.mozilla|microsoftedge/.test(r.url),
      ),
    ).toBe(false);

    const again = github({
      prs: [featurePr],
      statuses: {
        [featurePr.head.sha]: [{ context: GATE_CONTEXT, state: 'success' }],
      },
    });
    await main(['route'], env(dir), { fetch: again.fetch, log: quiet });
    expect(again.posted).toEqual([]);
  });

  it('route: never passes a commit that is a release PR head', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    // A fork PR opened on the release PR's head commit.
    const spoof = {
      ...featurePr,
      number: 176,
      head: {
        ...featurePr.head,
        sha: releasePr.head.sha,
        repo: { full_name: 'someone/fork' },
      },
    };
    for (const argv of [['route'], ['route', '--pr', '176']]) {
      const { fetch, posted } = github({ prs: [releasePr, spoof] });
      expect(await main(argv, env(dir), { fetch, log: quiet })).toBe(0);
      expect(posted).toEqual([]);
    }
  });

  it('check: posts a failure on the release PR head while a store is behind', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    const { fetch, posted } = github({
      prs: [releasePr, featurePr],
      chrome: 'chrome-in-review.json',
    });
    expect(await main(['check'], env(dir), { fetch, log: quiet })).toBe(0);
    expect(posted).toEqual([
      {
        sha: releasePr.head.sha,
        state: 'failure',
        context: GATE_CONTEXT,
        description: 'Expected 2.2.0: Chrome lists 2.1.0, 2.2.0 in review',
        target_url: 'https://github.com/EINDEX/logseq-copilot/actions/runs/42',
      },
    ]);
    expect(readFileSync(join(dir, 'summary'), 'utf8')).toContain(
      'Chrome: lists 2.1.0, expected 2.2.0, **behind**',
    );
  });

  it('check: turns green on a later run once the store lists the version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    const statuses = {
      [releasePr.head.sha]: [
        {
          context: GATE_CONTEXT,
          state: 'failure',
          description: 'Expected 2.2.0: Chrome lists 2.1.0, 2.2.0 in review',
        },
      ],
    };
    const { fetch, posted } = github({ prs: [releasePr], statuses });
    await main(['check'], env(dir), { fetch, log: quiet });
    expect(posted).toMatchObject([
      {
        state: 'success',
        description: 'Chrome, Edge and Firefox all list 2.2.0',
      },
    ]);

    const unchanged = github({
      prs: [releasePr],
      statuses: {
        [releasePr.head.sha]: [{ context: GATE_CONTEXT, ...posted[0] }],
      },
    });
    await main(['check'], env(dir), { fetch: unchanged.fetch, log: quiet });
    expect(unchanged.posted).toEqual([]);
  });

  it('check: posts error and exits 1 when the check itself fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    const { fetch, posted } = github({ prs: [releasePr] });
    const { CHROME_PUBLISHER_ID, ...noPublisher } = env(dir);
    expect(CHROME_PUBLISHER_ID).toBeDefined();
    expect(await main(['check'], noPublisher, { fetch, log: quiet })).toBe(1);
    expect(posted).toMatchObject([
      {
        state: 'error',
        description: 'Check error, not a store lag: Chrome check error',
      },
    ]);
  });

  it('check: honours the skip label', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    const skipped = {
      ...releasePr,
      labels: [...releasePr.labels, { name: 'skip-store-gate' }],
    };
    const { fetch, posted } = github({
      prs: [skipped],
      chrome: 'chrome-in-review.json',
    });
    expect(await main(['check'], env(dir), { fetch, log: quiet })).toBe(0);
    expect(posted).toMatchObject([
      {
        state: 'success',
        description: expect.stringMatching(
          /^Skipped \(skip-store-gate label\)\. Would be failure/,
        ),
      },
    ]);
  });

  it('check --dry-run posts nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-'));
    const { fetch, posted } = github({ prs: [releasePr] });
    const log = [];
    expect(
      await main(['check', '--dry-run'], env(dir), {
        fetch,
        log: (line) => log.push(line),
      }),
    ).toBe(0);
    expect(posted).toEqual([]);
    expect(log[0]).toBe(
      `#175 (aaaaaaa): success: Chrome, Edge and Firefox all list 2.2.0`,
    );
  });
});
