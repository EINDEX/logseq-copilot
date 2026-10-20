import { defineConfig } from 'wxt';
import { version } from './package.json';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

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
    name: 'Logseq Copilot',
    description:
      'Logseq Copilot, Connect with you logseq API server, bring your information when you browsing.',
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
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@/*': path.resolve(__dirname, './src/*'),
  },
  vite: () => ({
    plugins: [tailwindcss()],
    optimizeDeps: {
      // rollupOptions: true
    },
  }),
});
