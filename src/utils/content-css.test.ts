import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripRegisteredProperties } from './content-css';

// Shaped like the Tailwind v4 output of globals.css.
const TAILWIND_CSS = [
  '/*! tailwindcss v4 */',
  '@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-translate-x:0;--tw-shadow:0 0 #0000;--tw-ring-offset-width:0px;--tw-rotate-x:initial}}}',
  '@layer theme,base,components,utilities;',
  '@layer base{img{display:block}}',
  '@layer utilities{.slide-in{--tw-translate-x:.5rem;translate:var(--tw-translate-x) var(--tw-translate-y)}}',
  '@property --tw-translate-x{syntax:"*";inherits:false;initial-value:0}',
  '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}',
  '@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}',
  '@property --tw-rotate-x{syntax:"*";inherits:false}',
].join('\n');

describe('stripRegisteredProperties', () => {
  it('removes every @property rule', () => {
    expect(TAILWIND_CSS).toMatch(/@property\b/);
    expect(stripRegisteredProperties(TAILWIND_CSS)).not.toMatch(/@property\b/);
  });

  it('keeps the defaults, outside of any @supports', () => {
    const css = stripRegisteredProperties(TAILWIND_CSS);

    expect(css).not.toContain('@supports');
    expect(css).toContain(
      '@layer properties{*,:before,:after,::backdrop{--tw-translate-x:0;--tw-shadow:0 0 #0000;--tw-ring-offset-width:0px;--tw-rotate-x:initial}}',
    );
  });

  it('leaves the other rules alone', () => {
    const css = stripRegisteredProperties(TAILWIND_CSS);

    expect(css).toContain('@layer theme,base,components,utilities;');
    expect(css).toContain('@layer base{img{display:block}}');
    expect(css).toContain(
      '.slide-in{--tw-translate-x:.5rem;translate:var(--tw-translate-x) var(--tw-translate-y)}',
    );
  });

  it('handles CSS that is not minified', () => {
    const css = stripRegisteredProperties(`
      @layer properties {
        @supports (-moz-orient: inline) {
          *, :before { --tw-shadow: 0 0 #0000; }
        }
      }
      @property --tw-shadow {
        syntax: "*";
        inherits: false;
        initial-value: 0 0 #0000;
      }
    `);

    expect(css).not.toMatch(/@property\b|@supports/);
    expect(css).toContain('--tw-shadow: 0 0 #0000;');
  });

  it('returns CSS without @property rules unchanged', () => {
    const css = '@layer base{body{margin:0}}';

    expect(stripRegisteredProperties(css)).toBe(css);
  });

  it('refuses to drop a property that has no default', () => {
    const css =
      '@layer properties{@supports (a:b){*{--tw-a:0}}}@property --tw-a{syntax:"*";inherits:false}@property --tw-b{syntax:"*";inherits:false}';

    expect(() => stripRegisteredProperties(css)).toThrow('--tw-b');
  });

  it('refuses to drop properties when there are no defaults at all', () => {
    const css = '@property --tw-a{syntax:"*";inherits:false}';

    expect(() => stripRegisteredProperties(css)).toThrow('@layer properties');
  });
});

// WXT appends the @property rules of the content stylesheet to the <head> of
// every page the extension runs on. Run `pnpm build` first; skipped without a
// build.
const builtContentCss = resolve(
  process.cwd(),
  '.output/chrome-mv3/content-scripts/content.css',
);

describe('built content script stylesheet', () => {
  it.skipIf(!existsSync(builtContentCss))(
    'registers no custom property in the page',
    () => {
      const css = readFileSync(builtContentCss, 'utf8');

      // Booleans, so a failure does not print the whole stylesheet.
      expect(css.match(/@property\b/g)?.length ?? 0).toBe(0);
      // The defaults the in-page UI relies on are still there.
      expect(/@layer properties\{\*,:before,:after,::backdrop\{/.test(css)).toBe(
        true,
      );
    },
  );
});
