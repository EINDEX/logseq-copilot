// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Logseq Copilot',
  tagline: 'Connect Browser and Logseq',
  favicon: 'img/favicon.png',

  // Set the production url of your site here
  url: 'https://logseq-copilot.eindex.me',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'eindex', // Usually your GitHub org/user name.
  projectName: 'logseq-copliot', // Usually your repo name.

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/eindex/logseq-copilot',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      // image: "img/docusaurus-social-card.jpg",
      navbar: {
        title: 'Logseq Copilot',
        logo: {
          alt: 'Logseq Copilot',
          src: 'img/favicon.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Documents',
          },
          { to: '/docs/changelogs', label: 'Changelogs', position: 'left' },
          {
            href: 'https://github.com/eindex/logseq-copilot',
            label: 'GitHub',
            position: 'right',
          },
          {
            to: '/docs/sponsor',
            label: '❤️ Sponsor',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Introduce',
                to: '/docs/intro',
              },
              {
                label: 'Setup',
                to: '/docs/setup',
              },
              {
                label: 'Changelogs',
                to: '/docs/changelogs',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Github Discussions',
                href: 'https://github.com/EINDEX/logseq-copilot/discussions',
              },
              {
                label: 'Twitter',
                href: 'https://x.com/eindex',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/eindex/logseq-copilot',
              },
              {
                label: 'Sponsor',
                to: '/docs/sponsor',
              },
              {
                label: 'Author',
                href: 'https://eindex.me',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} EINDEX. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossorigin: 'true',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,100..900;1,100..900&display=swap',
      },
    },
    {
      tagName: 'script',
      attributes: {
        'data-website-id': '6728c810-c8a8-43ae-b072-4788d1ec7cc9',
        src: 'https://umami.eindex.me/script.js',
        defer: 'true',
        async: 'true',
      },
    },
    {
      tagName: 'script',
      attributes: {
        src: 'https://www.googletagmanager.com/gtag/js?id=G-23WMVW5BP4',
        async: 'true',
      },
    },
    {
      tagName: 'script',
      attributes: {},
      innerHTML:
        " window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-23WMVW5BP4');",
    },
  ],
};

export default config;
