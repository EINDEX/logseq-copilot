type SafariManifest = {
  permissions?: string[];
  side_panel?: unknown;
  web_accessible_resources?: unknown[];
};

/**
 * Safari's converter warns about `side_panel`, the `sidePanel` permission and
 * `use_dynamic_url`, and ignores them. The sidepanel entrypoint is left out of
 * the Safari build (it draws the sidebar on the page), so only the
 * permission and `use_dynamic_url` need dropping here. Changes the manifest
 * in place.
 */
export function dropUnsupportedSafariKeys<T extends SafariManifest>(
  manifest: T,
): T {
  delete manifest.side_panel;
  if (manifest.permissions) {
    manifest.permissions = manifest.permissions.filter(
      (permission) => permission !== 'sidePanel',
    );
  }
  for (const entry of manifest.web_accessible_resources ?? []) {
    if (typeof entry === 'object' && entry !== null) {
      delete (entry as Record<string, unknown>).use_dynamic_url;
    }
  }
  return manifest;
}
