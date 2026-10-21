# Browser E2E tests

The built extension runs in Playwright's Chromium and Firefox against a real
Logseq, for both graph types (`LOGSEQ_VARIANT=file|db`, same matrix as
`tests/integration`). Both browsers run the same specs (Playwright projects
`chromium` and `firefox`); the browser differences live in the `ext` fixture
(`fixtures.ts`).

## How it works

- **Logseq**: `global-setup.ts` starts one Logseq for the run with the
  launcher shared with the integration tests (`tests/support/logseq-app.ts`):
  throwaway HOME and user data dir, HTTP API server on `LOGSEQ_API_PORT`
  (default 12315) with a fixed token, the fixture file graph or the seeded
  DB "Demo" graph.
- **Builds**: `pnpm test:e2e` builds the packaged extension (`wxt build`,
  closed shadow roots) and the E2E build (`WXT_E2E=true`, open shadow roots
  so locators can see the in-page UI) for both browsers, then runs both
  projects: `.output/chrome-mv3`, `.output/chrome-mv3-e2e`,
  `.output/firefox-mv3`, `.output/firefox-mv3-e2e`. Only
  `closed-shadow.spec.ts` loads the packaged build. `pnpm test:e2e:chromium`
  / `pnpm test:e2e:firefox` build and run one browser.
- **Chromium**: every test gets a fresh profile from
  `chromium.launchPersistentContext` with `--load-extension`; the full Chromium
  build (`channel: 'chromium'`) runs extensions in headless mode. Extension
  code runs in the service worker (`worker.evaluate`), extension pages are
  ordinary Playwright pages.
- **Firefox**: Playwright's Firefox (Juggler) has no option to load an
  extension and never attaches to `moz-extension://` documents (they hang
  any Playwright call). WebDriver BiDi (`channel: 'moz-firefox'`) has the same
  limit (Firefox skips extension contexts, bug 1755014). So each test:
  - launches `firefox.launchPersistentContext` with
    `-start-debugger-server <free port>` and prefs: remote debugging on, no
    connection prompt, a fixed extension UUID
    (`extensions.webextensions.uuids`, `FIREFOX_UUID` in `fixtures.ts`),
    `extensions.openPopupWithoutUserGesture.enabled`, and a long
    `extensions.background.idle.timeout` so the event page is not suspended
    mid-test;
  - sets up routes and tracing, then installs the build over the remote
    debugging protocol (`installTemporaryAddon`, `firefox-rdp.ts`), the way
    `web-ext run` and about:debugging do. Order matters: after install there
    is a `moz-extension://` tab, and context-wide Playwright commands wait
    forever on it;
  - opens the test page, then closes the options tab the install opened
    (Firefox loads it into the initial `about:blank` tab);
  - runs extension code (`ext.evaluate`, storage, messages) in the background
    page through its console actor (`evaluateJSAsync`), found with the
    add-on's watcher.
- **Extension pages** (`ext.openPage`, `ext.openPopup`) return an `ExtPage`
  with a small API (`expectText`, `expectButton`, `fill`, `press`, `click`,
  `isChecked`, ...). Chromium backs it with Playwright locators; Firefox runs
  the same steps as DOM scripts in the page's console actor (untrusted
  events: `click()`, the native value setter plus `input`, synthetic key
  events). Only `popup.spec.ts` and `options.spec.ts` use it.
- **Extension config**: written to `chrome.storage.local` from the background
  context (`logseqHostName`, `logseqPort`, `logseqAuthToken`,
  `enableClipNoteFloatButton`).
- **Sites**: `context.route` serves fixture pages (`pages.ts`): a minimal
  Google result page for `https://www.google.com/search?q=…` and articles on
  `https://example.com/…`. Every other request is aborted, nothing goes to the
  internet. Content scripts inject into routed pages in both browsers.
- **Popup**: Chromium: `popup.html` is opened in its own unfocused window
  (`chrome.windows.create({ focused: false })`), so
  `tabs.query({ active: true, lastFocusedWindow: true })` in the popup still
  returns the page under test; the real toolbar popup
  (`chrome.action.openPopup()`) is not exposed to Playwright as a page.
  Firefox: the real toolbar popup, `action.openPopup({ windowId })` on the
  page's window (a popup window would become the last focused window there).
- **Clip shortcut**: Playwright key presses never reach `commands`, so the
  tests send the message the `clip` command handler sends
  (`content:quickCapture` to the tab, webext-core format) from the background,
  after activating the tab and focusing its window (Firefox does not focus a
  window Playwright opens). Everything after the shortcut is real.
- **Highlights**: the CSS Custom Highlight API needs Firefox 140+; Playwright's
  Firefox is newer (157 with Playwright 1.64), so the highlight specs run in
  both browsers.

Failures keep a screenshot of every open page and a Playwright trace in
`test-results/e2e/<test>/` (`pnpm exec playwright show-trace <trace.zip>`), and
an HTML report in `playwright-report/`.

## Run on CI

`.github/workflows/integration.yml`, job `e2e` (matrix `chromium` / `firefox`
x `file` / `db`): same Logseq cache and Xvfb as the integration job,
`playwright install --with-deps` for that browser,
`xvfb-run -a pnpm test:e2e:<browser>`, test results uploaded as an artifact on
failure.

## Run locally

Needs the Playwright browsers once:

```sh
pnpm exec playwright install chromium --no-shell
pnpm exec playwright install firefox
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

- `pnpm test:e2e:chromium` / `pnpm test:e2e:firefox` build and test one
  browser.
- `pnpm test:e2e:run [--project=chromium|firefox] [filter]` skips the builds
  (rebuild with `pnpm build:e2e` / `pnpm build:e2e:firefox` after source
  changes).
- `E2E_HEADED=1` shows the browser windows, `LOGSEQ_DEBUG=1` streams Logseq's
  logs.
- The Logseq window opens while the tests run; it is closed (with its helper
  processes) at the end, also when setup fails.
