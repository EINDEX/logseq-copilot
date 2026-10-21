/**
 * z-index of the in-page UI (float button, comment popup, highlights
 * sidebar): the largest value a browser accepts, so it stays above whatever
 * the host page stacks. A string because it goes straight into inline styles.
 *
 * Lives in its own module so UI shared with extension pages can use it
 * without importing anything from the content script entrypoint.
 */
export const zIndex = '2147483647';
