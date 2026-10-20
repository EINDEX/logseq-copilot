# Browser E2E tests

The built extension runs in Playwright's Chromium against a real Logseq, for
both graph types (`LOGSEQ_VARIANT=file|db`, same matrix as
`tests/integration`).

## How it works

- **Logseq**: `global-setup.ts` starts one Logseq for the run with the
  launcher shared with the integration tests (`tests/support/logseq-app.ts`):
  throwaway HOME and user data dir, HTTP API server on `LOGSEQ_API_PORT`
  (default 12315) with a fixed token, the fixture file graph or the seeded
  DB "Demo" graph.
- **Builds**: `pnpm test:e2e` runs `wxt build` (packaged build,
  `.output/chrome-mv3`, closed shadow roots) and `pnpm build:e2e`
  (`WXT_E2E=true`, `.output/chrome-mv3-e2e`, open shadow roots so locators can
  see the in-page UI), then the tests. Only `closed-shadow.spec.ts` loads the
  packaged build.
- **Browser**: every test gets a fresh profile from
  `chromium.launchPersistentContext` with `--load-extension`; the full Chromium
  build (`channel: 'chromium'`) runs extensions in headless mode.
- **Extension config**: written to `chrome.storage.local` from the extension
  service worker (`logseqHostName`, `logseqPort`, `logseqAuthToken`,
  `enableClipNoteFloatButton`).
- **Sites**: `context.route` serves fixture pages (`pages.ts`): a minimal
  Google result page for `https://www.google.com/search?q=…` and articles on
  `https://example.com/…`. Every other request is aborted, nothing goes to the
  internet.
- **Popup**: `popup.html` is opened in its own unfocused window
  (`chrome.windows.create({ focused: false })`), so
  `tabs.query({ active: true, lastFocusedWindow: true })` in the popup still
  returns the page under test. The real toolbar popup
  (`chrome.action.openPopup()`) is not exposed to Playwright as a page.
- **Clip shortcut**: Playwright key presses never reach `chrome.commands`, so
  the tests send the message the `clip` command handler sends
  (`content:quickCapture` to the tab, webext-core format) from the service
  worker. Everything after the shortcut is real.

Failures keep a screenshot of every open page and a Playwright trace in
`test-results/e2e/<test>/` (`pnpm exec playwright show-trace <trace.zip>`), and
an HTML report in `playwright-report/`.

## Run on CI

`.github/workflows/integration.yml`, job `e2e` (matrix `file` / `db`): same
Logseq cache and Xvfb as the integration job,
`xvfb-run -a pnpm test:e2e`, test results uploaded as an artifact on failure.

## Run locally

Needs the Playwright Chromium once:

```sh
pnpm exec playwright install chromium --no-shell
```

macOS: `scripts/download-logseq.sh` puts the Logseq `.zip` build into
`.logseq-bin/` (never `/Applications`). The test Logseq has its own HOME and
`--user-data-dir`, so it can run next to your own Logseq; give it a free port,
the launcher refuses a port that is already taken (your Logseq usually listens
on 12315).

```sh
BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
LOGSEQ_VARIANT=file LOGSEQ_BIN=$BIN LOGSEQ_API_PORT=12399 pnpm test:e2e

BIN=$(scripts/download-logseq.sh db 2.0.2 .logseq-bin | tail -n 1)
LOGSEQ_VARIANT=db LOGSEQ_BIN=$BIN LOGSEQ_API_PORT=12399 pnpm test:e2e
```

Linux: the same, under `xvfb-run -a` (Logseq needs a display; see
`tests/integration/README.md` for the system packages).

- `pnpm test:e2e:run [filter]` skips the builds (rebuild with
  `pnpm build:e2e` after source changes).
- `E2E_HEADED=1` shows the browser windows, `LOGSEQ_DEBUG=1` streams Logseq's
  logs.
- The Logseq window opens while the tests run; it is closed (with its helper
  processes) at the end, also when setup fails.
