/**
 * z-index of the in-page UI (float button, comment popup): the largest value
 * a browser accepts, so it stays above whatever the host page stacks. A string
 * because it goes straight into inline styles.
 *
 * Lives in its own module so components can use it without importing anything
 * from the content script entrypoint.
 */
export const zIndex = '2147483647';
