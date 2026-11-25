# Releasing

Releases are driven by [release-please](https://github.com/googleapis/release-please)
from [Conventional Commits](https://www.conventionalcommits.org/) on `main`.

1. Merge work into `wxt`, the development branch, with conventional commit
   messages (`feat:`, `fix:`, `perf:`, `refactor:`, `feat!:` /
   `BREAKING CHANGE:` for majors). To release, merge `wxt` into `main`.
2. `.github/workflows/release-please.yml` opens or updates a "chore: release
   X.Y.Z" PR that bumps `package.json` and `.release-please-manifest.json` and
   writes `CHANGELOG.md`.
3. Merge that PR. release-please tags `vX.Y.Z`, creates the GitHub release, and
   the same workflow then calls `.github/workflows/publish.yml`, which builds
   and uploads to the Chrome Web Store, Edge Add-ons and Firefox AMO, and
   attaches the zips to the GitHub release.

The extension version and zip file names come from `package.json`.

## Store gate

A release PR can only be merged when the previous release is live in every
store: the `stores-in-sync` status on the PR passes only when the Chrome Web
Store, Edge Add-ons and Firefox AMO all list the version of the latest GitHub
release. Store reviews take days, and a new upload would queue behind (or
replace) the one still in review.

- `.github/workflows/stores-in-sync.yml` runs every 6 hours, when
  release-please updates the release PR, and on PR events. It posts the
  status on the PR's head commit, so the PR turns green by itself after the
  stores approve the release. To check now: Actions > Stores in sync > Run
  workflow (or `gh workflow run stores-in-sync.yml`).
- A failure says which store lists which version, the expected version, and
  whether a Chrome submission is in review (AMO and Edge only show their
  public version). An `error` status means the check itself failed (a store
  API or the Edge page changed or is down), not that a store is behind.
- Versions: Chrome from the Chrome Web Store API `fetchStatus` (the publish
  credentials, read only), Firefox from the public AMO API, Edge from the
  data its public store page loads (`getproductdetailsbycrxid`). The store
  ids come from `docs/src/components/stores.ts`.
- Emergency fix: add the `skip-store-gate` label to the release PR. The
  status passes and says it was skipped and what it would have been.
- Every other PR to `main` gets a passing `stores-in-sync` status ("Not a
  release PR"), because the required check applies to all of them.

To make it required: Settings > Rules > Rulesets > `main` > Require status
checks to pass > Add checks > `stores-in-sync`. Leave the source as "Any
source" (it is a commit status, not a GitHub Actions check run).

## Changes that do not release

Every store release waits for review again, so changes that are not in the
extension package must not start one. `exclude-paths` in
`release-please-config.json` makes release-please skip a commit when all its
files are under these folders, whatever its type (even `feat:`):

| Folder | What it is |
| --- | --- |
| `docs/` | The website (`docs.yml` deploys it on its own) |
| `store/` | Store listing text and screenshots |
| `.github/`, `pipeline/`, `scripts/` | CI, store upload and dev tooling |
| `tests/` | Tests |

A commit that also changes anything else (`src/`, `public/`, `wxt.config.ts`,
`package.json`, ...) still counts. Keep site and store changes in their own
commits, and use these types so the history says the same thing:

- Website: `docs(site): ...`
- Store listing: `docs(store): ...`
- CI: `ci: ...`

A fix to `publish.yml` or `pipeline/` does not release either. To ship an
existing version again, run Publish by hand (below).

To see what release-please would do with the commits on `main` since the last
release, without changing anything:

```sh
npx release-please@17 release-pr --dry-run \
  --repo-url EINDEX/logseq-copilot --token "$(gh auth token)"
```

## Why `publish.yml` is called, not triggered by the tag

Tags and releases created with the default `GITHUB_TOKEN` do not start other
workflows, so `on: push: tags` in `publish.yml` never fires for release-please.
`release-please.yml` calls `publish.yml` (`workflow_call`) when
`release_created` is true instead. No personal access token is needed.

## Publishing by hand

- Push a `vX.Y.Z` tag, or
- Actions > Publish > Run workflow, with the existing tag (for example to retry
  one store after fixing a secret). Set `platforms` (for example
  `chrome,edge`) to skip the stores that already have this version: AMO
  rejects a version it has, and that fails the run.

  ```sh
  gh workflow run publish.yml -f tag=v2.0.0 -f platforms=chrome,edge
  ```

Edge Add-ons rejects a manifest with `key`, so Edge gets its own zip
(`pnpm zip:edge`) and only the Chrome build has `key`. For tags from before
`zip:edge` (v2.0.0), the workflow takes `key` out of that run's Chrome zip
before the Edge upload.

`publish.yml` rejects anything that is not an existing `vX.Y.Z` tag and always
builds `refs/tags/<tag>`, never a branch or SHA.

Recommended repository settings, because this job holds the store secrets:

- Environment `publish` > deployment branches and tags: allow only `v*` tags
  and `main` (`main` is the ref seen when release-please calls the workflow).
- Settings > Rules > Rulesets: protect `v*` tags (restrict creation, updates
  and deletion to maintainers).

## First release: 2.0.0

`release-please-config.json` has `"release-as": "2.0.0"` so the next release is
2.0.0 regardless of the commits (the manifest baseline is 1.15.2).

release-please does not clear this setting. **After the 2.0.0 release PR is
merged, delete the `"release-as"` line** from `release-please-config.json`;
otherwise every later release PR keeps proposing 2.0.0. The first CHANGELOG
entry will be 2.0.0; earlier release notes stay on the GitHub releases page.

## Required secrets (environment `publish`)

| Secret | Used for |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Chrome Web Store OAuth |
| `CHROME_PUBLISHER_ID` | Chrome Web Store publisher id (Dashboard > Publisher > Settings) |
| `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` | Edge Add-ons API v1.1 (Partner Center > Publish API) |
| `FIREFOX_WEB_EXT_API_KEY`, `FIREFOX_WEB_EXT_API_SECRET` | AMO API credentials (JWT issuer / secret) |

## Dev build numbers

`pnpm version:dev` writes `X.Y.Z.N` (N is the commit count) into `package.json`
for local test builds. Never commit that; run `pnpm version:reset` to undo it.

## Preview builds

`.github/workflows/preview.yml` packages the development branch so it can be
tried without a local build. It runs on every push to `wxt`, and by hand from
Actions > Preview > Run workflow (any branch).

Each run typechecks, tests, sets the version to `X.Y.Z.N` with
`PREVIEW_BUILD=1 pnpm version:dev` (not committed), builds the Chrome and
Firefox zips, and replaces the single pre-release tagged `preview`:

- Release page: <https://github.com/EINDEX/logseq-copilot/releases/tag/preview>
- Chrome / Edge: <https://github.com/EINDEX/logseq-copilot/releases/download/preview/logseq-copilot-preview-chrome.zip>
- Firefox (unsigned): <https://github.com/EINDEX/logseq-copilot/releases/download/preview/logseq-copilot-preview-firefox.zip>

The release notes say which branch and commit it was built from and how to
install it.

The package is named "Logseq Copilot Preview", in the extension list and on
the toolbar button, so it can be told apart from the store version. Chrome and
Edge also show the version as `X.Y.Z.N-preview` (`version_name`); Firefox has
no `version_name` and shows `X.Y.Z.N`. The Package step sets both with
`WXT_PREVIEW_LABEL` and `WXT_PREVIEW_VERSION_NAME`, read by `wxt.config.ts`.
Without them (releases, local and e2e builds) the manifest is unchanged.

It does not publish to any store and does not affect release-please. The tag
is `preview`, not `v*`: a `v*` tag would start `publish.yml`, and
release-please could take it as the previous release. The release is created
with `GITHUB_TOKEN`, so it starts no other workflows. The pre-release is never
marked as the latest release.

## PR previews

`.github/workflows/pr-preview.yml` packages every pull request to `main` that
comes from a branch of this repository (pull requests from forks are skipped).
Each build waits for approval: the job uses the `pr-preview` environment, whose
only required reviewer is EINDEX. Approve or reject the run from the PR's
checks or the Actions run page. Nothing from the PR runs, not even the
checkout, until the run is approved.

Each approved run typechecks, tests, sets the version in `package.json` (not
committed), builds the Chrome and Firefox zips, and publishes a pre-release
named after the next release version and the PR number:

- Tag and title: `v<next version>-<PR number>-preview`, for example
  `v2.0.0-104-preview`.
- Assets: `logseq-copilot-v2.0.0-104-preview-chrome.zip` and
  `logseq-copilot-v2.0.0-104-preview-firefox.zip` (unsigned).
- Extension name: "Logseq Copilot Preview #104", in the extension list and on
  the toolbar button, so it can be told apart from the store version.
- Extension version: `2.0.0.104`. `wxt.config.ts` copies the `package.json`
  version into the manifest as is, and browsers only accept up to four
  numeric parts there. Chrome and Edge show `2.0.0-104-preview` instead
  (`version_name`); Firefox has no `version_name` and shows `2.0.0.104`.

The name and `version_name` come from `WXT_PREVIEW_LABEL` and
`WXT_PREVIEW_VERSION_NAME` on the Package step, the same as for preview builds.

The next version is the first of: `release-as` in
`release-please-config.json`, the X.Y.Z in the title of the open release-please
PR, the version in `package.json`.

A push to the PR replaces its preview (and a run still waiting for approval).
The workflow comments the release link on the PR once and edits that comment
on later pushes. Closing or merging the PR deletes the preview release and
tag; that job runs no PR code and needs no approval.

The `pr-preview` environment only allows `refs/pull/*/merge`, the ref of
`pull_request` runs, so no other workflow can use it.

The `v*` tag is safe:

- It is created with `GITHUB_TOKEN`, so it starts no other workflow, and
  `publish.yml` rejects any tag that is not exactly `vX.Y.Z`.
- release-please only takes a release as the previous one when its tag
  version equals the version in `.release-please-manifest.json`.
  `2.0.0-104-preview` never equals it, so the changelog is not cut short.

The workflow runs from the PR's merge commit, so it only has to be on `wxt`:
the `wxt` → `main` release PR brings it along.
