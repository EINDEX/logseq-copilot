# Releasing

Releases are driven by [release-please](https://github.com/googleapis/release-please)
from [Conventional Commits](https://www.conventionalcommits.org/) on `main`.

1. Merge work into `main` with conventional commit messages (`feat:`, `fix:`,
   `perf:`, `refactor:`, `feat!:` / `BREAKING CHANGE:` for majors).
2. `.github/workflows/release-please.yml` opens or updates a "chore: release
   X.Y.Z" PR that bumps `package.json` and `.release-please-manifest.json` and
   writes `CHANGELOG.md`.
3. Merge that PR. release-please tags `vX.Y.Z`, creates the GitHub release, and
   the same workflow then calls `.github/workflows/publish.yml`, which builds
   and uploads to the Chrome Web Store, Edge Add-ons and Firefox AMO, and
   attaches the zips to the GitHub release.

The extension version and zip file names come from `package.json`.

## Why `publish.yml` is called, not triggered by the tag

Tags and releases created with the default `GITHUB_TOKEN` do not start other
workflows, so `on: push: tags` in `publish.yml` never fires for release-please.
`release-please.yml` calls `publish.yml` (`workflow_call`) when
`release_created` is true instead. No personal access token is needed.

## Publishing by hand

- Push a `vX.Y.Z` tag, or
- Actions > Publish > Run workflow, with the existing tag (for example to retry
  one store after fixing a secret).

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
