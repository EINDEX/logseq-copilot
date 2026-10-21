const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Extension pages (options, popup) follow the system color scheme: `.dark`
 * on the root element switches the design tokens in globals.css. The in-page
 * UI follows the host page instead (ThemeProvider). Returns the cleanup.
 */
export function followSystemColorScheme(
  root: HTMLElement = document.documentElement,
): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const apply = () => root.classList.toggle('dark', media.matches);
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}
