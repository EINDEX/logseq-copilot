// The `stores-in-sync` gate: a release-please PR may only be merged once the
// Chrome Web Store, Edge Add-ons and Firefox AMO all list the version of the
// latest GitHub release. Store reviews take days, and a new release must not
// queue behind (or replace) one that is still in review.
//
// This file has the parsing and the verdict as pure functions, and the
// read-only store requests. pipeline/stores-in-sync.mjs posts the result as a
// commit status; .github/workflows/stores-in-sync.yml runs it.
//
// Where each store's version comes from:
// - Chrome: Chrome Web Store API v2 `fetchStatus` (OAuth, the publish
//   credentials; the call only reads). It also says whether a submission is
//   in review.
// - Firefox: the public AMO API, `current_version.version`.
// - Edge: the Edge Add-ons Publish API has no "listed version". The public
//   store page is an empty shell that its script fills from
//   `getproductdetailsbycrxid/<crxId>`; we read the same public data.

export const GATE_CONTEXT = 'stores-in-sync';
export const SKIP_LABEL = 'skip-store-gate';
/** release-please's PR branches: release-please--branches--main--components--logseq-copilot */
export const RELEASE_BRANCH_PREFIX = 'release-please--';
/** GitHub drops a commit status description over 140 characters. */
export const DESCRIPTION_MAX = 140;

export const STORES = ['chrome', 'edge', 'firefox'];
export const STORE_NAMES = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
};

const REQUEST_TIMEOUT_MS = 30_000;
const VERSION = /^\d+(\.\d+){0,3}$/;
const CRX_ID = /^[a-p]{32}$/;

/**
 * kind: 'parse' (a response we do not understand), 'api' (an HTTP error),
 * 'network' (no response), 'config' (missing setting or secret).
 */
export class GateError extends Error {
  constructor(message, { kind = 'api', cause } = {}) {
    super(message, { cause });
    this.name = 'GateError';
    this.kind = kind;
  }
}

const parseError = (message) => new GateError(message, { kind: 'parse' });

// ---------------------------------------------------------------------------
// Store ids

/** The website's store links: docs/src/components/stores.ts. */
export const STORE_LINKS_FILE = new URL(
  '../docs/src/components/stores.ts',
  import.meta.url,
);

/**
 * `{ id, href }` of each entry in stores.ts. Read as text: it is TypeScript
 * from the docs project, whose tsconfig needs the docs dependencies.
 */
export function parseStoreLinks(source) {
  const links = [
    ...source.matchAll(/\bid:\s*'([^']+)'[^}]*?\bhref:\s*'([^']+)'/g),
  ].map(([, id, href]) => ({ id, href }));
  if (links.length === 0)
    throw new GateError('no store links found in stores.ts', {
      kind: 'config',
    });
  return links;
}

/**
 * The store ids from the store links of the website, so there is no second
 * copy of them.
 */
export function storeIdsFromLinks(stores) {
  const url = (id) => {
    const store = stores.find((s) => s.id === id);
    if (!store)
      throw new GateError(`no ${id} link in stores.ts`, { kind: 'config' });
    return new URL(store.href);
  };
  const last = (pathname) => pathname.split('/').filter(Boolean).at(-1);

  const chrome = last(url('chrome').pathname);
  const edge = last(url('edge').pathname);
  const firefoxPath = url('firefox').pathname.match(/\/addon\/([^/]+)\/?$/);
  const ids = { chrome, edge, firefox: firefoxPath?.[1] };

  if (!CRX_ID.test(ids.chrome ?? ''))
    throw new GateError(`bad Chrome item id '${ids.chrome}' in stores.ts`, {
      kind: 'config',
    });
  if (!CRX_ID.test(ids.edge ?? ''))
    throw new GateError(`bad Edge item id '${ids.edge}' in stores.ts`, {
      kind: 'config',
    });
  if (!ids.firefox)
    throw new GateError('no AMO slug in the Firefox link in stores.ts', {
      kind: 'config',
    });
  return ids;
}

// ---------------------------------------------------------------------------
// Parsers (pure). Each returns { published, pending, notes } or throws a
// GateError of kind 'parse'.
//   published: the version the store lists publicly, or null if none.
//   pending:   { version, state } of a submission in review, null if there is
//              none, undefined if the store's public data cannot tell.

/** GitHub `GET /repos/{repo}/releases/latest` → "X.Y.Z". */
export function parseLatestRelease(json) {
  const tag = json?.tag_name;
  const match = typeof tag === 'string' && tag.match(/^v(\d+\.\d+\.\d+)$/);
  if (!match)
    throw parseError(`latest GitHub release has tag '${tag}', not vX.Y.Z`);
  return match[1];
}

/** Chrome Web Store API v2 `publishers.items.fetchStatus`. */
export function parseChromeStatus(json) {
  if (!json || typeof json !== 'object' || typeof json.itemId !== 'string') {
    throw parseError('Chrome fetchStatus response has no itemId');
  }
  const notes = [];
  const versionsOf = (revision) =>
    (revision?.distributionChannels ?? [])
      .filter((channel) => typeof channel?.crxVersion === 'string')
      .map((channel) => ({
        version: channel.crxVersion,
        percent: channel.deployPercentage ?? 100,
      }));

  let published = null;
  const live = json.publishedItemRevisionStatus;
  if (live) {
    const channels = versionsOf(live);
    if (live.state !== 'PUBLISHED') {
      notes.push(`the published revision is ${live.state}, not public`);
    } else if (channels.length === 0) {
      throw parseError('Chrome published revision has no crxVersion');
    } else {
      // A staged rollout lists the new version at under 100%: the version
      // most users get is the listed one.
      const top = channels.reduce((a, b) => (b.percent > a.percent ? b : a));
      published = top.version;
      for (const c of channels) {
        if (c !== top) notes.push(`${c.version} rolled out to ${c.percent}%`);
      }
    }
  }
  if (json.takenDown) {
    notes.push('taken down for a policy violation');
    published = null;
  }
  if (json.warned) notes.push('warned for a policy violation');

  let pending = null;
  const submitted = json.submittedItemRevisionStatus;
  if (submitted) {
    const version = versionsOf(submitted)[0]?.version ?? 'unknown version';
    if (submitted.state === 'PENDING_REVIEW' || submitted.state === 'STAGED') {
      pending = { version, state: submitted.state };
    } else if (submitted.state === 'REJECTED') {
      notes.push(`submission ${version} was rejected`);
    }
  }
  return { published, pending, notes };
}

/** AMO `GET /api/v5/addons/addon/<slug>/`. */
export function parseAmoAddon(json) {
  const version = json?.current_version?.version;
  if (typeof version !== 'string' || !VERSION.test(version)) {
    throw parseError('AMO response has no current_version.version');
  }
  const notes = [];
  if (json.is_disabled || (json.status && json.status !== 'public')) {
    notes.push(
      `add-on status is ${json.is_disabled ? 'disabled' : json.status}`,
    );
    return { published: null, pending: undefined, notes };
  }
  return { published: version, pending: undefined, notes };
}

/** Edge store page data (`getproductdetailsbycrxid/<crxId>`), as text. */
export function parseEdgeDetails(body, crxId) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw parseError('Edge store data is not JSON, the store page has changed');
  }
  if (json?.crxId !== crxId) {
    throw parseError(`Edge store data is for '${json?.crxId}', not ${crxId}`);
  }
  if (typeof json.version !== 'string' || !VERSION.test(json.version)) {
    throw parseError(
      'Edge store data has no version, the store page has changed',
    );
  }
  return { published: json.version, pending: undefined, notes: [] };
}

// ---------------------------------------------------------------------------
// Verdict (pure)

const truncate = (text, max) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

function pendingText(result) {
  if (result.pending === undefined)
    return 'in review: unknown (public data only)';
  if (result.pending === null) return 'in review: none';
  const state =
    result.pending.state === 'STAGED'
      ? 'approved, not published yet'
      : 'in review';
  return `in review: ${result.pending.version} (${state})`;
}

/**
 * @param expected  { ok: true, version } | { ok: false, error }
 * @param results   { chrome|edge|firefox: { ok: true, published, pending, notes } | { ok: false, error } }
 * @param skip      the PR has the skip-store-gate label
 * @returns { state: 'success'|'failure'|'error', verdict, description, lines }
 *   state is the commit status to post; verdict is the state without the skip.
 */
export function evaluate({ expected, results, skip = false }) {
  const lines = [];
  const lagging = [];
  const errors = [];

  if (!expected.ok) {
    errors.push(`latest release: ${expected.error.message}`);
    lines.push(
      `- Latest GitHub release: **check error**: ${expected.error.message}`,
    );
  } else {
    lines.push(`- Latest GitHub release: v${expected.version}`);
  }

  for (const store of STORES) {
    const name = STORE_NAMES[store];
    const result = results[store];
    if (!result?.ok) {
      const error =
        result?.error ?? new GateError('not checked', { kind: 'config' });
      const what = error.kind === 'parse' ? 'parse failed' : 'check error';
      errors.push(`${name} ${what}`);
      lines.push(`- ${name}: **${what}** (${error.kind}): ${error.message}`);
      continue;
    }
    const listed = result.published ?? 'nothing';
    const notes = result.notes.length ? `; ${result.notes.join('; ')}` : '';
    if (!expected.ok) {
      lines.push(`- ${name}: lists ${listed}, ${pendingText(result)}${notes}`);
      continue;
    }
    const inSync = result.published === expected.version;
    if (!inSync) {
      const review = result.pending
        ? `, ${result.pending.version} in review`
        : '';
      lagging.push(`${name} lists ${listed}${review}`);
    }
    lines.push(
      `- ${name}: lists ${listed}, expected ${expected.version}, ${
        inSync ? 'in sync' : '**behind**'
      }, ${pendingText(result)}${notes}`,
    );
  }

  let verdict;
  let summary;
  if (lagging.length > 0) {
    verdict = 'failure';
    summary = `Expected ${expected.version}: ${lagging.join('; ')}`;
    if (errors.length) summary += `; check error: ${errors.join(', ')}`;
  } else if (errors.length > 0) {
    verdict = 'error';
    summary = `Check error, not a store lag: ${errors.join(', ')}`;
  } else {
    verdict = 'success';
    summary = `Chrome, Edge and Firefox all list ${expected.version}`;
  }

  if (skip) {
    lines.unshift(
      `- **Skipped** by the \`${SKIP_LABEL}\` label. Without it: ${verdict}.`,
    );
    return {
      state: 'success',
      verdict,
      description: truncate(
        `Skipped (${SKIP_LABEL} label). Would be ${verdict}: ${summary}`,
        DESCRIPTION_MAX,
      ),
      lines,
    };
  }
  return {
    state: verdict,
    verdict,
    description: truncate(summary, DESCRIPTION_MAX),
    lines,
  };
}

// ---------------------------------------------------------------------------
// Pull requests (pure)

/** A PR that release-please opened from this repository. */
export function isReleasePr(pr, repository) {
  return (
    typeof pr?.head?.ref === 'string' &&
    pr.head.ref.startsWith(RELEASE_BRANCH_PREFIX) &&
    pr.head.repo?.full_name === repository
  );
}

export const hasSkipLabel = (pr) =>
  (pr?.labels ?? []).some((label) => label?.name === SKIP_LABEL);

// ---------------------------------------------------------------------------
// Read-only requests

/** fetch → text; network and HTTP errors become GateErrors without headers. */
export async function request(fetch, url, init, what) {
  let res;
  let body;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = await res.text();
  } catch (error) {
    throw new GateError(
      `${what}: request failed (${error?.message ?? error})`,
      { kind: 'network', cause: error },
    );
  }
  if (!res.ok) {
    const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new GateError(
      `${what}: HTTP ${res.status}${snippet ? ` ${snippet}` : ''}`,
      { kind: 'api' },
    );
  }
  return body;
}

export async function requestJson(fetch, url, init, what) {
  const body = await request(fetch, url, init, what);
  try {
    return JSON.parse(body);
  } catch {
    throw parseError(`${what}: response is not JSON`);
  }
}

export async function fetchLatestRelease({ fetch, repository, token }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const json = await requestJson(
    fetch,
    `https://api.github.com/repos/${repository}/releases/latest`,
    { headers },
    'GitHub latest release',
  );
  return parseLatestRelease(json);
}

export async function fetchChrome({
  fetch,
  itemId,
  publisherId,
  clientId,
  clientSecret,
  refreshToken,
}) {
  const required = {
    CHROME_PUBLISHER_ID: publisherId,
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REFRESH_TOKEN: refreshToken,
  };
  for (const [name, value] of Object.entries(required)) {
    if (!value) throw new GateError(`${name} is not set`, { kind: 'config' });
  }
  const token = await requestJson(
    fetch,
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    },
    'Google OAuth token',
  );
  if (typeof token?.access_token !== 'string')
    throw parseError('Google OAuth token response has no access_token');

  const name = `publishers/${encodeURIComponent(
    publisherId,
  )}/items/${encodeURIComponent(itemId)}`;
  const json = await requestJson(
    fetch,
    `https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
    'Chrome fetchStatus',
  );
  return parseChromeStatus(json);
}

export async function fetchFirefox({ fetch, slug }) {
  const json = await requestJson(
    fetch,
    `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(
      slug,
    )}/`,
    { headers: { Accept: 'application/json' } },
    'AMO add-on',
  );
  return parseAmoAddon(json);
}

export async function fetchEdge({ fetch, crxId }) {
  const body = await request(
    fetch,
    `https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/${encodeURIComponent(
      crxId,
    )}`,
    { headers: { Accept: 'application/json' } },
    'Edge store page data',
  );
  return parseEdgeDetails(body, crxId);
}

const settle = (promise) =>
  promise.then(
    (value) => ({ ok: true, ...value }),
    (error) => ({
      ok: false,
      error:
        error instanceof GateError
          ? error
          : new GateError(String(error?.message ?? error), {
              kind: 'internal',
            }),
    }),
  );

/** Every lookup at once; a failed lookup is an { ok: false, error } result. */
export async function readStores({ fetch, ids, repository, env }) {
  const [expected, chrome, edge, firefox] = await Promise.all([
    settle(
      fetchLatestRelease({ fetch, repository, token: env.GITHUB_TOKEN }).then(
        (version) => ({ version }),
      ),
    ),
    settle(
      fetchChrome({
        fetch,
        itemId: ids.chrome,
        publisherId: env.CHROME_PUBLISHER_ID,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        refreshToken: env.GOOGLE_REFRESH_TOKEN,
      }),
    ),
    settle(fetchEdge({ fetch, crxId: ids.edge })),
    settle(fetchFirefox({ fetch, slug: ids.firefox })),
  ]);
  return { expected, results: { chrome, edge, firefox } };
}
