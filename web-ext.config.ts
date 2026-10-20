import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  startUrls: [
    'https://plugins-doc.logseq.com/',
    'https://google.com',
    'chrome-extension://hihgfcgbmnbomabfdbajlbpnacndeihl/options.html',
  ],
  // chromiumProfile: "./chromium-profile",
  // openDevtools: true,
  // chromiumPref: {
  //   extensions: {
  //     ui: {
  //       developer_mode: true,
  //     },
  //   },
  // }
});
