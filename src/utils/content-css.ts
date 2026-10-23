/**
 * Keep the content script stylesheet from registering anything in the page.
 *
 * Tailwind v4 declares its internal `--tw-*` custom properties with
 * `@property`. That at-rule is document-global and a shadow tree ignores it,
 * so WXT's `createShadowRootUi` lifts every `@property` rule out of the
 * content stylesheet and appends it, in a <style>, to the <head> of the page
 * the extension runs on. The registrations are last-wins, and ours come after
 * every stylesheet of the page, so on a site that uses Tailwind they replace
 * the site's own `--tw-translate-*`, `--tw-shadow`, `--tw-ring-*` ... and
 * change how its elements are laid out.
 *
 * The in-page UI does not need the registrations: Tailwind also emits the
 * defaults as plain declarations, `@layer properties { @supports (<old
 * browser>) { *, :before, :after, ::backdrop { --tw-x: <default> } } }`,
 * which a modern browser skips because of the `@supports` condition.
 * Unwrapping that block gives every element of the shadow tree its defaults
 * through the cascade, which is the same result as `inherits: false`.
 */

const PROPERTY_RULE = /@property\s+(--[\w-]+)\s*\{[^{}]*\}/g;
const PROPERTIES_LAYER = /@layer\s+properties\s*\{/;

function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i;
  }
  throw new Error('Unbalanced braces in the content stylesheet');
}

/** Replace every `@supports (...) { body }` in `rules` by its `body`. */
function unwrapSupports(rules: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const at = rules.indexOf('@supports', from);
    if (at === -1) return out + rules.slice(from);
    const open = rules.indexOf('{', at);
    const close = matchingBrace(rules, open);
    out += rules.slice(from, at) + rules.slice(open + 1, close);
    from = close + 1;
  }
}

/**
 * Remove the `@property` rules of `css` and make Tailwind's `@layer
 * properties` defaults unconditional. Throws if a removed property would be
 * left without a default, so a Tailwind upgrade cannot silently drop one.
 */
export function stripRegisteredProperties(css: string): string {
  const names = [...css.matchAll(PROPERTY_RULE)].map((match) => match[1]);
  if (names.length === 0) return css;

  const withoutRules = css.replace(PROPERTY_RULE, '');
  const layer = PROPERTIES_LAYER.exec(withoutRules);
  if (!layer) {
    throw new Error('No `@layer properties` defaults for the @property rules');
  }
  const open = layer.index + layer[0].length - 1;
  const close = matchingBrace(withoutRules, open);
  const defaults = unwrapSupports(withoutRules.slice(open + 1, close));

  const missing = names.filter((name) => !defaults.includes(`${name}:`));
  if (missing.length > 0) {
    throw new Error(`No default for ${missing.join(', ')}`);
  }

  return (
    withoutRules.slice(0, open + 1) + defaults + withoutRules.slice(close)
  );
}
