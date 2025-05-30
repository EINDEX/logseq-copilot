import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    permissions: ['storage', 'activeTab', 'contextMenus'],
  }
});
