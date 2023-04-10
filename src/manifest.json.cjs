const ReleaseFor = {
  chrome: {
    manifest_version: 3,
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnkAYeXnTWrNIu2h8D4xi9NHWLe0eTR3CX8DDw1c0qyCucaCKxkk/+gZcl89Ifyq5joXc/CeQrM3QVjrL1RAXrKZVqTNvBCUh1H1oJJ47nqkKKI6bNZVT8utjFTjDD1ZYXPYzQhsGuP/cY1wIrlhhIuawFW1h+UUwYlYQtS5FcjJ/RPrao+8KwJaS9p3Cei9rWXhE/PV19ZVOqOUx9ZSzj5/OYCB1u1VWFD5BlUbTXSbzyM/VvXZseAVruVy7oRHJ565AH/uPz2ZVL55Gz0LzcHw4HNRc2f+mSVAbHAuK7JDWtRlrZ3Fbav9qBrcVIAxTpnf5B2I2YMBMcu852Vkc3QIDAQAB',
    background: {
      service_worker: 'background.js',
    },
    web_accessible_resources: [
      {
        resources: ['content-script.css', 'assets/img/logo.png'],
        matches: [],
      },
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'Logseq Copilot',
    },
    host_permissions: ['*://*/*'],
  },
  edge: {
    manifest_version: 3,
    background: {
      service_worker: 'background.js',
    },
    web_accessible_resources: [
      {
        resources: ['content-script.css', 'assets/img/logo.png'],
        matches: [],
      },
    ],
    action: {
      default_popup: 'popup.html',
      default_title: 'Logseq Copilot',
    },
  },
  firefox: {
    manifest_version: 2,
    background: {
      scripts: ['background.js'],
    },
    web_accessible_resources: ['content-script.css', 'assets/img/logo.png'],
    browser_action: {
      default_popup: 'popup.html',
      default_title: 'Logseq Copilot',
    },
    browser_specific_settings: {
      gecko: {
        id: '{dbe73d0a-f6b8-474a-ad39-0d46a07e4525}',
      },
    },
  },
};

const build = (releaseFor) => {
  return {
    version: process.env.VERSION,
    author: 'eindex.lee@gmail.com',
    name: 'Logseq Copilot',
    description:
      'Logseq Copilot, Connect with you logseq API server, bring your information when you browsing.',
    chrome_url_overrides: {},
    icons: {
      192: 'assets/img/logo-192.png',
    },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*', '<all_urls>'],
        js: ['content-script.js'],
        css: ['content-script.css'],
      },
    ],
    permissions: ['storage', 'activeTab', 'contextMenus'],
    options_ui: {
      page: 'options.html',
      browser_style: false,
      open_in_tab: true,
    },
    ...ReleaseFor[releaseFor],
  };
};

module.exports = build;
