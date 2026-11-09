import DOMPurify, { type Config } from 'dompurify';

/**
 * URLs a link or an image may have: http(s), logseq: (graph, page and block
 * links), mailto:, and relative ones (a path, `?query` or `#fragment`).
 * Everything else, `javascript:` and `data:` included, is removed. The
 * relative part is DOMPurify's own: no scheme before the first `:`.
 */
const SAFE_URL = /^(?:(?:https?|logseq|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/** What browsers ignore in a URL attribute (DOMPurify's ATTR_WHITESPACE). */
const URL_WHITESPACE = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g;

const URL_ATTRIBUTES = ['href', 'src', 'xlink:href', 'action', 'formaction'];

const CONFIG: Config = {
  // HTML only (no SVG or MathML), without scripts or event handlers.
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
    'link',
    'meta',
    'base',
    'template',
  ],
  // A style attribute could cover the page the sidebar is drawn on.
  FORBID_ATTR: ['style', 'srcset', 'action', 'formaction'],
  ALLOWED_URI_REGEXP: SAFE_URL,
};

let purifier: ReturnType<typeof DOMPurify> | undefined;

const getPurifier = () => {
  if (purifier) return purifier;
  // An instance of its own: the hook below does not reach other users of
  // DOMPurify.
  purifier = DOMPurify(window);
  // DOMPurify lets `data:` through on img, audio, video, ... whatever
  // ALLOWED_URI_REGEXP says; this applies the same rule to every URL.
  purifier.addHook('afterSanitizeAttributes', (node) => {
    for (const name of URL_ATTRIBUTES) {
      const value = node.getAttribute?.(name);
      if (value != null && !SAFE_URL.test(value.replace(URL_WHITESPACE, ''))) {
        node.removeAttribute(name);
      }
    }
  });
  return purifier;
};

/**
 * HTML of Logseq notes, safe to put in the DOM. The background renders blocks
 * with marked, which passes raw HTML in the Markdown through, and the in-page
 * sidebar draws them in the page's own document, where a script would run as
 * the site. Removes scripts, frames, plugins, forms, styles, every event
 * handler attribute and unsafe URLs (see SAFE_URL); keeps text formatting,
 * lists, code, tables, images, marks, links and their class and data
 * attributes.
 */
export function sanitizeHtml(html: string): string {
  const fragment = getPurifier().sanitize(html, { ...CONFIG, RETURN_DOM_FRAGMENT: true });
  // An image whose URL was removed (`data:`, ...) is named instead, like an
  // image of the graph's assets folder (see tool.ts), not drawn broken.
  for (const img of fragment.querySelectorAll('img:not([src])')) {
    const label = document.createElement('span');
    label.className = 'logseq-asset';
    label.textContent = img.getAttribute('alt') || 'image';
    img.replaceWith(label);
  }
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}
