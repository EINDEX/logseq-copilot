const ReleaseFor = {
  chrome: {
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnkAYeXnTWrNIu2h8D4xi9NHWLe0eTR3CX8DDw1c0qyCucaCKxkk/+gZcl89Ifyq5joXc/CeQrM3QVjrL1RAXrKZVqTNvBCUh1H1oJJ47nqkKKI6bNZVT8utjFTjDD1ZYXPYzQhsGuP/cY1wIrlhhIuawFW1h+UUwYlYQtS5FcjJ/RPrao+8KwJaS9p3Cei9rWXhE/PV19ZVOqOUx9ZSzj5/OYCB1u1VWFD5BlUbTXSbzyM/VvXZseAVruVy7oRHJ565AH/uPz2ZVL55Gz0LzcHw4HNRc2f+mSVAbHAuK7JDWtRlrZ3Fbav9qBrcVIAxTpnf5B2I2YMBMcu852Vkc3QIDAQAB',
  },
  edge: {
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArg427MiWAPOW6ZtGWebRPWKJHv+IWBczKiyapsmdahLKaVk2YsHJdPhDIMTovcY91hTtwtW7lmJ8CLJHJNoosn52QZ6/qMu4zz5tcnjZA/FM4GN9BaybW/rXhR7LHY0WqKQ5UVYaJoYlNbQif5RnlUYRq2Z+q+bFdP6iJKHEljQjZwv84QFY6Pmln6iBKR7CDBOSr3X917FtzTwIiqnkfSm998+La1dUMfEzfq2qFYq1CuBEFHUtFNU7BCXmnIABefRQygdV9gVqSvyODt756Z2SmvEGhlzla/HVLf+ud84wEXqLnW3I0bvSTGExncxAkM/9fyKjHrGYuuFB9BgnqQIDAQAB',
  },
};

const build = (releaseFor) => {
  return {
    version: '0.0.5',
    author: 'eindex.lee@gmail.com',
    key: ReleaseFor[releaseFor]['key'],
    manifest_version: 3,
    name: 'Logseq Copilot',
    description:
      'Logseq Copilot, Connect with you logseq API server, bring your information when you browsing.',
    options_page: 'options.html',
    background: {
      service_worker: 'background.js',
    },
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
    web_accessible_resources: [
      {
        resources: ['content-script.css', 'assets/img/logo.png'],
        matches: [],
      },
    ],
    permissions: ['storage'],
  };
};

module.exports = build;
