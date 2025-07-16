import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Logseq Copilot',
  description: 'Connect Browser and Logseq',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Documents', link: '/doc' },
      { text: 'Sponsor', link: '/sponsor' },
    ],
    logo: '/favicon.png',

    sidebar: [
      {
        text: 'Documents',
        items: [
          { text: 'Introduce', link: '/doc' },
          { text: 'Setup', link: '/doc/setup' },
          { text: 'Changelogs', link: '/changelogs' },
        ],
      },
      {
        text: 'Community',
        items: [
          {
            text: 'Github Discussions',
            link: 'https://github.com/EINDEX/logseq-copilot/discussions',
          },
          { text: 'Twitter(X)', link: 'https://x.com/eindex' },
        ],
      },
      {
        text: 'More',
        items: [
          { text: 'Sponsor', link: '/sponsor' },
          { text: 'Author', link: 'https://eindex.me' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/eindex/logseq-copilot' },
    ],
    footer: {
      copyright: 'Copyright © 2022-present EINDEX',
    },
    editLink: {
      pattern: 'https://github.com/eindex/logseq-copilot/edit/main/docs/:path',
    },
    search: {
      provider: 'local',
    },
  },
  sitemap: {
    hostname: 'https://logseq-copilot.eindex.me',
  },
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.png' }],
    [
      'link',
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    ],
    [
      'link',
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
      },
    ],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,100..900;1,100..900&display=swap',
      },
    ],
    [
      'script',
      {
        src: 'https://a.eindex.me/api/script.js',
        'data-site-id': '1',
        'data-tracking-errors': 'true',
        'data-session-replay': 'true',
        defer: true
      },
    ],
    [
      'script',
      {
        async: '',
        src: 'https://www.googletagmanager.com/gtag/js?id=G-23WMVW5BP4',
      },
    ],
    [
      'script',
      {},
      `window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-23WMVW5BP4');`,
    ],
  ],
});
