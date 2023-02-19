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
  },
  firefox: {
    manifest_version: 2,
    background: {
      scripts: ['background.js'],
    },
    persistent: true,
    web_accessible_resources: ['content-script.css', 'assets/img/logo.png'],
  },
};

const build = (releaseFor) => {
  return {
    version: '0.0.5',
    author: 'eindex.lee@gmail.com',
    name: 'Logseq Copilot',
    description:
      'Logseq Copilot, Connect with you logseq API server, bring your information when you browsing.',
    chrome_url_overrides: {},
    icons: {
      192: 'assets/img/logo.png',
    },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*', '<all_urls>'],
        js: ['content-script.js'],
        css: ['content-script.css'],
      },
    ],
    permissions: ['storage'],
    options_ui: {
      page: 'options.html',
      browser_style: false,
      open_in_tab: true,
    },
    ...ReleaseFor[releaseFor],
  };
};

module.exports = build;
