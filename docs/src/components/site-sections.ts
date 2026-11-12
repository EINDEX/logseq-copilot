/**
 * The two sections of the site, linked from the header (ThemeSelect override)
 * and, on narrow screens, from the top of the menu (Sidebar override).
 * The landing page `/` is in neither.
 */
export const sections = [
	{ id: 'docs', label: 'Docs', href: '/introduction/' },
	{ id: 'blog', label: 'Blog', href: '/blog/' },
] as const;

type SectionId = (typeof sections)[number]['id'];

export function currentSection(pathname: string): SectionId | undefined {
	if (pathname === '/' || pathname === '') return undefined;
	if (pathname === '/blog' || pathname.startsWith('/blog/')) return 'blog';
	return 'docs';
}

/**
 * `aria-current` for a section link: `page` on the page it links to, `true`
 * elsewhere in its section, nothing outside it.
 */
export function ariaCurrent(
	section: (typeof sections)[number],
	pathname: string,
): 'page' | 'true' | undefined {
	if (currentSection(pathname) !== section.id) return undefined;
	const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
	return path === section.href ? 'page' : 'true';
}
