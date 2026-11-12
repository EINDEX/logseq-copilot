/**
 * Arc puts the colors of the user's space on every page as CSS custom
 * properties on the root element. Its user agent is Chrome's, so this is the
 * one sign of it a content script has.
 */
const ARC_PALETTE_PROPERTIES = [
  '--arc-palette-background',
  '--arc-palette-title',
  '--arc-palette-foregroundPrimary',
] as const;

/** Whether the computed style of a page's root element has Arc's palette. */
export function hasArcPalette(
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
): boolean {
  return ARC_PALETTE_PROPERTIES.some(
    (name) => style.getPropertyValue(name).trim() !== '',
  );
}
