/**
 * Mode of the shadow roots the content script mounts its UI in.
 *
 * Packaged builds use `closed`, so page scripts cannot reach the UI through
 * `host.shadowRoot`. Dev builds (`wxt`) and E2E builds (`WXT_E2E=true wxt
 * build`) use `open`, so DevTools and Playwright locators can see inside.
 */
export type ShadowRootMode = 'open' | 'closed';

export const resolveShadowRootMode = (env: {
  dev?: boolean;
  e2e?: string | boolean;
}): ShadowRootMode =>
  env.dev || env.e2e === true || env.e2e === 'true' ? 'open' : 'closed';

export const shadowRootMode: ShadowRootMode = resolveShadowRootMode({
  dev: import.meta.env.DEV,
  e2e: import.meta.env.WXT_E2E,
});
