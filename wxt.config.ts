import { defineConfig } from 'wxt';
import { version } from './package.json';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { stripRegisteredProperties } from './src/utils/content-css';

// CI preview builds only (preview.yml, pr-preview.yml; see RELEASING.md), so
// they stand apart from the store version in the browser's extension list.
// Unset for release, dev and e2e builds, which keep the manifest as is.
// - WXT_PREVIEW_LABEL: put after the name, e.g. `Preview #104`.
// - WXT_PREVIEW_VERSION_NAME: Chromium's version_name, e.g.
//   `2.0.0-104-preview`. WXT leaves it out of Firefox builds.
const previewLabel = process.env.WXT_PREVIEW_LABEL || undefined;
const previewVersionName = process.env.WXT_PREVIEW_VERSION_NAME || undefined;
const name = previewLabel ? `Logseq Copilot ${previewLabel}` : 'Logseq Copilot';

export default defineConfig({
  srcDir: 'src',
  // E2E builds (WXT_E2E=true, open shadow roots) get their own output folder
  // so they can never be zipped or published by mistake.
  ...(process.env.WXT_E2E === 'true' && {
    outDirTemplate: '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}-e2e',
  }),
  // Firefox defaults to MV2 in WXT; the store listing has always been MV3.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    version: version,
    ...(previewVersionName && { version_name: previewVersionName }),
    name,
    description:
      'Your Logseq notes next to search results and in a sidebar for the page you are on. Clip text and links into your graph.',
    // Firefox requires a string here; Chromium browsers take { email }.
    author:
      browser === 'firefox'
        ? 'eindex.lee@gmail.com'
        : { email: 'eindex.lee@gmail.com' },
    permissions: ['storage', 'activeTab', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    commands: {
      clip: {
        suggested_key: {
          default: 'Ctrl+Shift+U',
        },
        description: 'Make Clip note',
      },
      // No default shortcut: any combination can clash with the browser's own
      // or another extension's. Users bind their own in the browser's shortcut
      // settings.
      'open-sidebar': {
        description: 'Open sidebar',
      },
    },
    // The toolbar button opens the sidebar (src/entrypoints/background). WXT
    // only writes the action for a popup entrypoint, and there is none.
    action: {
      default_title: name,
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
        192: 'icon-192.png',
      },
    },
    // Pins the Chromium extension id; Firefox does not know this field.
    ...(browser === 'firefox' ? {} : { key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnkAYeXnTWrNIu2h8D4xi9NHWLe0eTR3CX8DDw1c0qyCucaCKxkk/+gZcl89Ifyq5joXc/CeQrM3QVjrL1RAXrKZVqTNvBCUh1H1oJJ47nqkKKI6bNZVT8utjFTjDD1ZYXPYzQhsGuP/cY1wIrlhhIuawFW1h+UUwYlYQtS5FcjJ/RPrao+8KwJaS9p3Cei9rWXhE/PV19ZVOqOUx9ZSzj5/OYCB1u1VWFD5BlUbTXSbzyM/VvXZseAVruVy7oRHJ565AH/uPz2ZVL55Gz0LzcHw4HNRc2f+mSVAbHAuK7JDWtRlrZ3Fbav9qBrcVIAxTpnf5B2I2YMBMcu852Vkc3QIDAQAB' }),
    web_accessible_resources: [
      {
        resources: ['assets/img/logo.png'],
        matches: ['http://*/*', 'https://*/*', '<all_urls>'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: '{dbe73d0a-f6b8-474a-ad39-0d46a07e4525}',
        // MV3 host_permissions are only granted at install time from 127 on.
        strict_min_version: '127.0',
        // Data only goes to the user's own Logseq API server.
        data_collection_permissions: { required: ['none'] },
      },
    },
  }),
  // WXT takes the Firefox sidebar title from the <title> of the sidepanel
  // page, after the manifest option above is applied.
  ...(previewLabel && {
    hooks: {
      'build:manifestGenerated': (_, manifest) => {
        if (manifest.sidebar_action?.default_title) {
          manifest.sidebar_action.default_title = name;
        }
      },
    },
  }),
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@/*': path.resolve(__dirname, './src/*'),
  },
  vite: () => ({
    plugins: [
      tailwindcss(),
      {
        // WXT lifts every @property rule of the content stylesheet into the
        // <head> of the page the extension runs on. Keep Tailwind's from
        // reaching the page; extension pages (assets/*.css) keep theirs.
        name: 'logseq-copilot:content-css-no-page-globals',
        // After Vite's own CSS plugin, which emits the stylesheet in this hook.
        enforce: 'post',
        generateBundle(_, bundle) {
          for (const [fileName, file] of Object.entries(bundle)) {
            if (
              file.type === 'asset' &&
              fileName.startsWith('content-scripts/') &&
              fileName.endsWith('.css')
            ) {
              file.source = stripRegisteredProperties(file.source.toString());
            }
          }
        },
      },
    ],
    optimizeDeps: {
      // rollupOptions: true
    },
  }),
});
