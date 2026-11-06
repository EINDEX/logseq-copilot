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
  events). Only `popup.spec.ts`, `options.spec.ts` and the highlight sync case
  in `highlight.spec.ts` use it.
- **Extension config**: written to `chrome.storage.local` from the background
  context (`logseqHostName`, `logseqPort`, `logseqAuthToken`,
  `enableClipNoteFloatButton`).
- **Sites**: `context.route` serves fixture pages (`pages.ts`): a minimal
  Google result page for `https://www.google.com/search?q=…` and articles on
  `https://example.com/…`. Every other request is aborted, nothing goes to the
  internet. Content scripts inject into routed pages in both browsers. Only
  the live site check (below) turns the routes off (fixture option
  `fixtureSites: false`).
- **Popup**: Chromium: `popup.html` is opened in its own unfocused window
  (`chrome.windows.create({ focused: false })`), so
  `tabs.query({ active: true, lastFocusedWindow: true })` in the popup still
  returns the page under test. Clicks in it are DOM `click()`s, as on
  Firefox: a Playwright click would activate the popup window, and the
  background, which clips `tabs.query({ active, currentWindow })`, would
  clip popup.html. The real toolbar popup
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

## Live site check

The specs above never reach a real site. `tests/e2e/live/` does: it opens
the live result page of every built-in search engine and checks that the
search card still mounts there and lists notes. A site that changes its
markup breaks an adapter without any test noticing; this check notices.
It is not part of `pnpm test:e2e*` or the Integration workflow (its own
config, its spec is `*.live.ts`); `.github/workflows/site-check.yml` runs it
every day.

### What it does

- **Sites**: `BUILT_IN_SEARCH_ENGINES` of `src/utils/storage.ts`, read from
  the source (`sites.ts`), so the check uses the selectors that ship. The
  result page per engine is in `LIVE_SITES` (`sites.ts`); the query is
  `copilot`.
- **Browser and Logseq**: the E2E build in Chromium with the fixtures and
  global setup above (real Logseq with the seeded graph), with the fixture
  routes off. The card renders only what Logseq answers, so a card that lists
  the seeded `Copilot Test Page` proves the URL match, the query and the mount
  point at once. The browser is headed (under `xvfb-run` on CI): the sites
  answer HeadlessChrome with captchas and challenge pages.
- **Waiting**: up to 30 s for the card to be visible with `Copilot Test Page`
  and in place (see "Placement"), and still so 3 s later (a page that
  renders its columns again after load can take the card out; the content
  script puts it back for 10 s).
- **Window**: 1400x900 px (the E2E fixtures), a desktop window: every site
  has room for its right column.

### Statuses

| Status | Meaning | Fails the run |
| --- | --- | --- |
| `ok` | The card is where the engine config puts it, lists the seeded page, and is in view right of the organic results (see "Placement"). | no |
| `degraded` | The card lists the seeded page from a fallback place: Brave without `#mixed-side` (top of `#mixed-main`), Kagi without `._0_right_sidebar`. The other engines have no fallback in `searchingEngines.ts`: without their `elementSelector` there is no card, which is `broken`. | yes |
| `blocked` | The site served a captcha, consent, challenge or error page, or could not be reached. Not an adapter fault. | no |
| `broken` | The page loaded and was not blocked, but there is no card, or it is hidden, empty, failing, without the seeded page or out of place, or the page has no organic results. | yes |
| `skipped` | This run cannot check the site: Kagi without `KAGI_SESSION_TOKEN`. | no |

- Google's own places count as `ok`: `#rhs` when the page has a right column,
  otherwise a column beside `#center_col` (most result pages have no `#rhs`).
  The top of the results column, where Google (`#center_col`) and Brave
  (`#mixed-main`) put the card in narrow windows, is out of place in the
  check's window.
- `degraded` fails like `broken`: it is a sure sign that the site changed its
  sidebar and the selector needs an update, and a warning on a scheduled run
  goes unread.
- `blocked` needs evidence, written into the note: the URL (Google
  `/sorry/`, `consent.*`, Yandex `showcaptcha`, `wappass.baidu.com`, Bing
  `/turing/`, Startpage `blocked.html`, Kagi `/turnstile` or sign-in), the
  title or text (DuckDuckGo "bots use DuckDuckGo too", 百度安全验证,
  Cloudflare "Just a moment...", captcha, "unusual traffic", "not a robot",
  "access denied", Anubis, region notices), or an HTTP status of 400 or more.
  The general text rules and the status count only on a page whose title
  does not name the query, since result pages can contain those words. The
  signal must last 12 s (a challenge can pass by itself). A navigation error
  is `blocked` ("unreachable"), and so is a Kagi sign-in request that fails.
- SearX tries the public instances in `SEARX_INSTANCES` in order; the first
  one that is not blocked decides.
- The note of a `broken` site lists what the check found: no card, a card
  (or its container) that was mounted and then removed by the page, a
  hidden, empty or failing card; whether the URL pattern matches, the query
  the engine reads, whether `elementSelector` is on the page (and its size),
  whether the content script ran, the documents the page loaded when it
  reloaded itself, and the content script's warnings.
- A `broken` or `degraded` site is checked once more in a fresh profile; the
  note says when the first attempt had another status.

### Placement

A card in the configured element can still be out of sight: that element can
be collapsed (Bing's `#b_context` was once 472x0 px) or an empty element the
site no longer shows. So `ok` also needs the card where a user sees it, next to
the results (`misplaced()` in `sites.ts`, measured by `inspect()` in
`site-check.live.ts`):

- **Organic results**: `organic` in `LIVE_SITES` selects them, apart from the
  engine config's selectors. When it finds none, the site is `broken`, "no
  organic results found": the site changed, and the check cannot tell where
  the results are.
- **Visible**: the card is at least 200 px wide (the right columns are 300
  to 470 px; narrower, its rows do not fit) and more than 0 px high, inside
  the window from left to right, not hidden by `display`, `visibility` or
  `opacity`, not cut off by an ancestor's `overflow`, and
  `elementFromPoint` at the centre of its part in the window finds the card.
  A layer over the whole page there does not count (fixed, or absolute with
  a `z-index`, outside the right column): that is a popup the visitor closes,
  like DuckDuckGo's browser promotion in every new profile.
- **Right of the results**: the card's left edge is at or right of the first
  result's right edge (4 px for borders and rounding), and the card overlaps
  none of the first 3 results.
- **Level with the results**: the card's top is in the first screen (above
  900 px) and at most 100 px from the top of the results column. The column
  is the outermost element around the first result that ends left of the
  card, so ads and answers above the first result do not count (Ecosia's
  first organic result can be 400 px down). The sites start their right
  column level with the results (Brave 24 px lower, by design); 100 px is
  less than a result is high, so a card further down sits next to another
  result or under something else.
- A card in a fallback place (`degraded`) is only checked to be visible: the
  fallback places are not in the right column.
- Every note of a card gives the boxes of the card, the first result and the
  results column (`x`, `y`, `w`, `h` in CSS px from the top left of the
  page); the note of a card out of place says which rule fails. A card out
  of place gets until the 30 s are up to move into place.

Results: `test-results/site-check/results.json`, `results.md` (the table)
and one screenshot per site (`<engine id>.png`, the first screen: the card
next to the results). Traces of failed attempts go
to `test-results/site-check-runs/` and are not uploaded on CI (they could hold
the Kagi sign-in request).

In the table, names, notes and URLs are code spans: a title, URL or console
message of a site cannot put a link, image, HTML, mention or issue reference
into the job summary or the issue. A cell is cut at 300 characters (a note
at 600), the table at 60000 (an issue body holds 65536); `results.json` keeps
the whole notes. `node tests/e2e/live/report.check.cjs` checks the table
with hostile notes.

### Run locally

```sh
BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
LOGSEQ_VARIANT=file LOGSEQ_BIN=$BIN LOGSEQ_API_PORT=12399 pnpm test:live
```

- `pnpm test:live:run` skips the build (`pnpm build:e2e`).
- `SITE_CHECK_SITES=bing,brave` checks some engines (ids of
  `BUILT_IN_SEARCH_ENGINES`).
- `KAGI_SESSION_TOKEN=<token>` checks Kagi: the token of a Kagi session link
  (Settings > Account > Session Link, `https://kagi.com/search?token=…`).
  The check opens the session link with the request API of the browser
  context, which shares its cookies with the browser, then the result page
  `https://kagi.com/search?q=copilot`: the token is in no checked URL, note or
  error message. A token that does not sign in gives Kagi's sign-in or human
  check page, `blocked`.
- Chromium windows open while it runs; `E2E_HEADED=` (empty) runs headless,
  and most sites then block it.
- Every site gets one query per run (two when it is retried). Many runs in a
  row get the IP blocked for a while, Google and Yandex first.

### Run on CI

`.github/workflows/site-check.yml`: every day at 01:23 UTC on `wxt`, and by
hand (Actions > Site check > Run workflow, on any ref) with the inputs
`sites` (empty for all) and `open_issue`. GitHub starts `schedule` runs only
from the workflow file on the default branch, so the daily run needs the
file on `main`.

- The table goes into the job summary; results and screenshots are the
  artifact `site-check`. The job fails when a site is `broken` or `degraded`.
- Scheduled runs (and manual runs with `open_issue`) keep one issue, "Site
  check: adapters broken" with the label `site-check`: opened, or its body
  updated, while a site is `broken` or `degraded`; closed with a comment by
  the first run that checks every site and finds none.
- Repository secret `KAGI_SESSION_TOKEN` (optional): without it Kagi is
  `skipped`. GitHub masks the secret in the log as it is; the workflow also
  masks its URL-encoded form, the one in the sign-in request.

### Add a site

1. A new entry in `BUILT_IN_SEARCH_ENGINES` is picked up by itself; until it
   has a result page it is `skipped`.
2. Add the result page for the query to `LIVE_SITES` in `sites.ts`, under the
   engine id, with the selector of its organic results (`organic`): try it
   on the live page.
3. If the content script mounts the card in another place than
   `elementSelector` for it (`searchingEngines.ts`), mirror that in
   `inspect()` in `site-check.live.ts`, as for Google, Brave and Kagi.
4. If the site has its own captcha or consent page, add a rule to `SPECIFIC`
   in `sites.ts`.
5. `SITE_CHECK_SITES=<id> pnpm test:live`.
