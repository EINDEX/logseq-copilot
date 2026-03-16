# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Logseq Copilot is a cross-browser extension (Chrome, Edge, Firefox) that surfaces your Logseq knowledge graph alongside search engine results and provides "Quick Capture" to clip web pages into Logseq. It uses Manifest V3.

### Tech stack

- **Runtime**: Node.js 18.x, pnpm 9
- **Language/UI**: TypeScript 4.9, React 18, Chakra UI, Tailwind CSS
- **Build**: Custom esbuild script (`build.mjs`) — no Webpack
- **Testing**: Jest 29 with `esbuild-jest` transform
- **Lint/Format**: ESLint (`react-app` config), Prettier, Husky pre-commit hook (runs `npm test`)

### Key commands

See `package.json` scripts. Quick reference:

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Run tests | `pnpm test` |
| Test with coverage | `pnpm test:coverage` |
| Build (all browsers) | `VERSION=v0.0.0 pnpm run build` |
| Dev watch mode | `VERSION=v0.0.0 pnpm start` |
| Lint | `npx eslint --ext .ts,.tsx,.js,.jsx src/` |
| Format | `pnpm prettier` |
| Docs dev server | `pnpm docs:dev` |

### Non-obvious caveats

- The `VERSION` env var must be set for build/start commands (e.g. `VERSION=v0.0.0`), otherwise the build output will have `undefined` as the version string.
- Build output goes to `build/{chrome,edge,firefox}` — load `build/chrome` as an unpacked extension in Chrome for testing.
- ESLint has 3 pre-existing errors in `src/components/LogseqBlock.tsx` (conditional hooks). These are not regressions.
- The pre-commit hook (`.husky/pre-commit`) runs `npm test`. Since the project uses pnpm, Jest is invoked via npm which still works because `jest` is in `node_modules/.bin`.
- This is a pure browser extension with no backend/database. The only runtime dependency is a locally running Logseq desktop app with its HTTP API server enabled (default `localhost:12315`), which is not needed for building/testing the extension itself.
- Sass deprecation warnings about "legacy JS API" during build are expected and harmless.
