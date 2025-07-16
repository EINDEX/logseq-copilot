import { defineConfig } from 'wxt';
import { version } from './package.json';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    version: version,
    name: 'Logseq Copilot',
    description:
      'Logseq Copilot, Connect with you logseq API server, bring your information when you browsing.',
    author: {
      email: 'eindex.lee@gmail.com',
    },
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
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnkAYeXnTWrNIu2h8D4xi9NHWLe0eTR3CX8DDw1c0qyCucaCKxkk/+gZcl89Ifyq5joXc/CeQrM3QVjrL1RAXrKZVqTNvBCUh1H1oJJ47nqkKKI6bNZVT8utjFTjDD1ZYXPYzQhsGuP/cY1wIrlhhIuawFW1h+UUwYlYQtS5FcjJ/RPrao+8KwJaS9p3Cei9rWXhE/PV19ZVOqOUx9ZSzj5/OYCB1u1VWFD5BlUbTXSbzyM/VvXZseAVruVy7oRHJ565AH/uPz2ZVL55Gz0LzcHw4HNRc2f+mSVAbHAuK7JDWtRlrZ3Fbav9qBrcVIAxTpnf5B2I2YMBMcu852Vkc3QIDAQAB',
    web_accessible_resources: [
      {
        resources: ['assets/img/logo.png'],
        matches: ['http://*/*', 'https://*/*', '<all_urls>'],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: '{dbe73d0a-f6b8-474a-ad39-0d46a07e4525}',
      },
    },
  },
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
