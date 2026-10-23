// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
	site: 'https://logseq-copilot.eindex.me',
	redirects: {
		// The extension's options page links to the setup guide at this old path.
		'/doc/setup': '/setup/',
	},
	integrations: [
		starlight({
			title: 'Logseq Copilot',
			tagline: 'Your Logseq notes, right where you browse',
			description: 'A browser extension for Chrome, Edge and Firefox that connects to your own Logseq: recall notes while you search and browse, clip pages, and keep highlights.',
			logo: {
				src: './src/assets/logo.png',
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/eindex/logseq-copilot'
				},
				{
					icon: 'twitter',
					label: 'Twitter',
					href: 'https://x.com/eindex'
				}
			],
			editLink: {
				baseUrl: 'https://github.com/eindex/logseq-copilot/edit/main/docs/',
			},
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'introduction' },
						{ label: 'Installation', slug: 'installation' },
						{ label: 'Setup', slug: 'setup' },
					],
				},
				{ label: 'Blog', autogenerate: { directory: 'blog' } },
				{
					label: 'Features',
					items: [
						{ label: 'Search Engines', slug: 'features/search-engines' },
						{ label: 'Recall Rules', slug: 'features/recall-rules' },
						{ label: 'Clipping & Templates', slug: 'features/clipping-and-templates' },
						{ label: 'Highlights Sidebar', slug: 'features/highlights-sidebar' },
						{ label: 'Highlight Comments', slug: 'features/highlight-comments' },
					],
				},
				{
					label: 'Development',
					items: [
						{ label: 'Testing Architecture', slug: 'development/testing-architecture' },
					],
				},
				{
					label: 'Community',
					items: [
						{ label: 'Sponsor', slug: 'sponsor' },
						{
							label: 'GitHub Discussions',
							link: 'https://github.com/EINDEX/logseq-copilot/discussions'
						},
						{
							label: 'Author',
							link: 'https://eindex.me'
						},
					],
				},
			],
			customCss: [
				'./src/styles/custom.css',
			],
			head: [
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.googleapis.com',
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'preconnect',
						href: 'https://fonts.gstatic.com',
						crossorigin: true,
					},
				},
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,100..900;1,100..900&display=swap',
					},
				},
				{
					tag: 'script',
					attrs: {
						src: 'https://a.eindex.me/api/script.js',
						'data-site-id': '3',
						'data-tracking-errors': 'true',
						'data-session-replay': 'true',
						defer: true,
					},
				},
				{
					tag: 'script',
					attrs: {
						async: true,
						src: 'https://www.googletagmanager.com/gtag/js?id=G-23WMVW5BP4',
					},
				},
				{
					tag: 'script',
					content: `window.dataLayer = window.dataLayer || [];
						function gtag(){dataLayer.push(arguments);}
						gtag('js', new Date());
						gtag('config', 'G-23WMVW5BP4');`,
				},
				{
					tag: 'script',
					attrs: {
						src: '/scripts/external-links.js',
						defer: true,
					},
				},
			],
		}),
		mdx(),
	],
});
