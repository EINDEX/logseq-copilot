// Posts the `stores-in-sync` commit status (pipeline/store-gate.mjs has the
// rules). Run by .github/workflows/stores-in-sync.yml.
//
//   node pipeline/stores-in-sync.mjs route [--pr N]
//     Every open PR to main (or PR N): marks the PRs that are not release PRs
//     as passing, once per head commit (never a commit that is the head of
//     an open release PR). Writes `release_prs=N,M` (the open
//     release PRs) to $GITHUB_OUTPUT. Reads no store.
//   node pipeline/stores-in-sync.mjs check [--pr N,M] [--dry-run]
//     Reads the stores once and posts the result on each release PR (default:
//     every open one). The status is only posted when it changed.
//     --dry-run posts nothing; without release PRs it still prints the stores.
//
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (default EINDEX/logseq-copilot),
// GITHUB_SERVER_URL + GITHUB_RUN_ID (status link), GITHUB_OUTPUT,
// GITHUB_STEP_SUMMARY; for Chrome CHROME_PUBLISHER_ID, GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
//
// Exit code 1 only when the gate could not do its job (state `error`, or a
// GitHub call failed), so a broken gate shows in the Actions tab. A store
// that is behind is a `failure` status, not a failed run.

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  GATE_CONTEXT,
  STORE_LINKS_FILE,
  evaluate,
  hasSkipLabel,
  isReleasePr,
  parseStoreLinks,
  readStores,
  requestJson,
  storeIdsFromLinks,
} from './store-gate.mjs';

const BASE_BRANCH = 'main';
const NOT_RELEASE =
  'Not a release PR: the store gate only applies to release-please PRs';

export function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (mode !== 'route' && mode !== 'check')
    throw new Error(
      `usage: stores-in-sync.mjs <route|check> [--pr N[,M]] [--dry-run]`,
    );
  const options = { mode, prs: [], dryRun: false };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--dry-run') options.dryRun = true;
    else if (rest[i] === '--pr') {
      const value = rest[++i] ?? '';
      for (const part of value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (!/^\d+$/.test(part))
          throw new Error(`--pr takes PR numbers, got '${part}'`);
        options.prs.push(Number(part));
      }
    } else throw new Error(`unknown argument '${rest[i]}'`);
  }
  return options;
}

function githubClient({ fetch, repository, token }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const api = (path, init = {}, what = `GitHub ${path}`) =>
    requestJson(
      fetch,
      `https://api.github.com/repos/${repository}${path}`,
      { ...init, headers: { ...headers, ...init.headers } },
      what,
    );

  return {
    async openPrs() {
      const prs = [];
      for (let page = 1; page <= 10; page++) {
        const batch = await api(
          `/pulls?state=open&base=${BASE_BRANCH}&per_page=100&page=${page}`,
        );
        prs.push(...batch);
        if (batch.length < 100) break;
      }
      return prs;
    },
    pr: (number) => api(`/pulls/${number}`),
    /** The newest status with our context on `sha`, or undefined. */
    async latestStatus(sha) {
      const statuses = await api(`/commits/${sha}/statuses?per_page=100`);
      return statuses.find((s) => s.context === GATE_CONTEXT);
    },
    postStatus: (sha, { state, description, targetUrl }) =>
      api(
        `/statuses/${sha}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            description,
            context: GATE_CONTEXT,
            ...(targetUrl ? { target_url: targetUrl } : {}),
          }),
        },
        `GitHub status on ${sha.slice(0, 7)}`,
      ),
  };
}

async function inScope(github, prNumbers) {
  if (prNumbers.length === 0) return github.openPrs();
  const prs = await Promise.all(prNumbers.map((n) => github.pr(n)));
  return prs.filter(
    (pr) => pr.state === 'open' && pr.base?.ref === BASE_BRANCH,
  );
}

export async function main(
  argv,
  env,
  { fetch = globalThis.fetch, log = console.log } = {},
) {
  const options = parseArgs(argv);
  const repository = env.GITHUB_REPOSITORY || 'EINDEX/logseq-copilot';
  const github = githubClient({ fetch, repository, token: env.GITHUB_TOKEN });
  const targetUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${repository}/actions/runs/${env.GITHUB_RUN_ID}`
      : undefined;
  const output = (line) =>
    env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${line}\n`);
  const summary = (text) =>
    env.GITHUB_STEP_SUMMARY &&
    appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);

  const prs = await inScope(github, options.prs);
  const releasePrs = prs.filter((pr) => isReleasePr(pr, repository));

  if (options.mode === 'route') {
    // A status belongs to a commit, not a PR. Another PR (from a fork, say)
    // whose head is a release PR's head commit must not get the pass, or it
    // would pass the release PR too. So look at every open release PR, not
    // only the ones in scope.
    const open = options.prs.length === 0 ? prs : await github.openPrs();
    const releaseHeads = new Set(
      open.filter((pr) => isReleasePr(pr, repository)).map((pr) => pr.head.sha),
    );
    for (const pr of prs.filter((p) => !isReleasePr(p, repository))) {
      if (releaseHeads.has(pr.head.sha)) {
        log(
          `#${pr.number}: head ${pr.head.sha.slice(
            0,
            7,
          )} is a release PR's head, not marking it`,
        );
        continue;
      }
      if (await github.latestStatus(pr.head.sha)) continue;
      log(
        `#${pr.number}: not a release PR, marking ${GATE_CONTEXT} as passing`,
      );
      if (!options.dryRun)
        await github.postStatus(pr.head.sha, {
          state: 'success',
          description: NOT_RELEASE,
          targetUrl,
        });
    }
    log(
      `Release PRs: ${
        releasePrs.map((pr) => `#${pr.number}`).join(', ') || 'none'
      }`,
    );
    output(`release_prs=${releasePrs.map((pr) => pr.number).join(',')}`);
    return 0;
  }

  // check
  const ids = storeIdsFromLinks(
    parseStoreLinks(readFileSync(STORE_LINKS_FILE, 'utf8')),
  );
  const { expected, results } = await readStores({
    fetch,
    ids,
    repository,
    env,
  });
  const targets =
    releasePrs.length > 0 ? releasePrs : options.dryRun ? [null] : [];
  if (targets.length === 0) log('No open release PR, nothing to post.');

  let broken = false;
  for (const pr of targets) {
    const result = evaluate({ expected, results, skip: hasSkipLabel(pr) });
    const heading = pr
      ? `#${pr.number} (${pr.head.sha.slice(0, 7)})`
      : 'No release PR (dry run)';
    log(`${heading}: ${result.state}: ${result.description}`);
    for (const line of result.lines) log(`  ${line}`);
    summary(
      `### ${GATE_CONTEXT}: ${heading}: ${result.state}\n\n${
        result.description
      }\n\n${result.lines.join('\n')}\n`,
    );
    if (result.verdict === 'error') {
      broken = true;
      log(`::error::${GATE_CONTEXT}: ${result.description}`);
    } else if (result.verdict === 'failure') {
      log(`::warning::${GATE_CONTEXT}: ${result.description}`);
    }
    if (!pr || options.dryRun) continue;

    const previous = await github.latestStatus(pr.head.sha);
    if (
      previous?.state === result.state &&
      previous?.description === result.description
    ) {
      log(`#${pr.number}: status unchanged`);
      continue;
    }
    await github.postStatus(pr.head.sha, {
      state: result.state,
      description: result.description,
      targetUrl,
    });
    log(`#${pr.number}: posted ${result.state}`);
  }
  return broken ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      // Only the message: request errors never carry headers or tokens.
      console.error(`::error::${GATE_CONTEXT}: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
