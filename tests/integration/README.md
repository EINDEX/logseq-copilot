# Logseq integration tests

Runs the extension's Logseq client/service code against a real Logseq desktop
app, for both graph types:

| variant | Logseq release | graph |
| ------- | -------------- | ----- |
| `file`  | 0.10.x         | `fixtures/file-graph`, opened from disk |
| `db`    | 2.x            | default "Demo" DB graph, seeded through the API |

`global-setup.ts` launches Logseq through the launcher shared with the E2E
tests (`tests/support/logseq-app.ts`): Playwright's Electron driver, a
throwaway `HOME` and user data dir. Before launch it writes `~/.config/Logseq/configs.edn`, which
turns on the HTTP API server with a known token. The file graph is opened
through `window.__MOCKED_OPEN_DIR_PATH__`, the same hook Logseq's own e2e tests
use to skip the native folder picker.

## Run locally (Linux)

```sh
# needs xvfb and libsecret-1-0
BIN=$(scripts/download-logseq.sh db 2.0.2 .logseq-bin | tail -n 1)
LOGSEQ_VARIANT=db LOGSEQ_BIN=$BIN xvfb-run -a pnpm test:integration

BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
LOGSEQ_VARIANT=file LOGSEQ_BIN=$BIN xvfb-run -a pnpm test:integration
```

## Run locally (macOS)

`scripts/download-logseq.sh` fetches the macOS `.zip` build into
`.logseq-bin/` (never `/Applications`). The test Logseq uses its own HOME and
`--user-data-dir`, so it runs next to an installed Logseq; only the API port
must differ, the launcher refuses a port that is already taken.

```sh
BIN=$(scripts/download-logseq.sh file 0.10.15 .logseq-bin | tail -n 1)
LOGSEQ_VARIANT=file LOGSEQ_BIN=$BIN LOGSEQ_API_PORT=12399 pnpm test:integration
```

Set `LOGSEQ_DEBUG=1` to stream Logseq's own logs.
