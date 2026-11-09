// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { sanitizeHtml } from './sanitize-html';

/** The sanitized HTML, parsed, to query. */
const clean = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = sanitizeHtml(html);
  return div;
};

describe('sanitizeHtml removes', () => {
  test('event handler attributes', () => {
    const el = clean('<img src="https://example.com/a.png" onerror="alert(1)"><p onclick="x()">t</p>');
    expect(el.innerHTML).not.toMatch(/onerror|onclick/i);
    expect(el.querySelector('img')!.getAttribute('src')).toBe('https://example.com/a.png');
    expect(el.querySelector('p')!.textContent).toBe('t');
  });

  test('script elements', () => {
    const el = clean('<p>a</p><script>alert(1)</script>');
    expect(el.querySelector('script')).toBeNull();
    expect(el.innerHTML).not.toContain('alert');
  });

  test('javascript: links, however they are written', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)']) {
      const el = clean(`<a href="${href}">x</a>`);
      expect(el.querySelector('a')!.hasAttribute('href')).toBe(false);
    }
  });

  test('data: URLs, also on images', () => {
    const el = clean(
      '<a href="data:text/html,<script>alert(1)</script>">x</a><img src="data:image/svg+xml;base64,PHN2Zz4=">',
    );
    expect(el.querySelector('a')!.hasAttribute('href')).toBe(false);
    expect(el.innerHTML).not.toContain('data:');
  });

  test('an image whose URL was removed is named, not drawn broken', () => {
    const el = clean('<img src="data:image/png;base64,AAAA" alt="diagram"><img src="javascript:alert(1)">');
    expect(el.querySelector('img')).toBeNull();
    expect([...el.querySelectorAll('span.logseq-asset')].map((s) => s.textContent)).toEqual([
      'diagram',
      'image',
    ]);
  });

  test('frames, plugins, forms and styles', () => {
    const el = clean(
      '<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">' +
        '<form action="https://evil.example"><input name="p"><button>go</button></form>' +
        '<style>body{display:none}</style><p style="position:fixed;inset:0">t</p>',
    );
    for (const tag of ['iframe', 'object', 'embed', 'form', 'input', 'button', 'style']) {
      expect(el.querySelector(tag)).toBeNull();
    }
    expect(el.querySelector('p')!.hasAttribute('style')).toBe(false);
  });

  test('SVG with scripts in it', () => {
    const el = clean('<svg><script>alert(1)</script><a href="javascript:alert(1)">x</a></svg>');
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('script')).toBeNull();
  });
});

describe('sanitizeHtml keeps', () => {
  test('web, mailto, relative and fragment links', () => {
    const hrefs = ['https://github.com/logseq/logseq', 'http://example.com/', 'mailto:me@example.com', '/path', '#section', '?q=1'];
    const el = clean(hrefs.map((href) => `<a href="${href}">x</a>`).join(''));
    expect([...el.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(hrefs);
  });

  test('logseq: links with their classes', () => {
    const html =
      '<a class="logseq-page-link" href="logseq://graph/my%20notes?page=books">books</a>' +
      '<a class="logseq-tag" href="logseq://graph/my%20notes?page=bug">#bug</a>' +
      '<a class="logseq-block-ref" href="logseq://graph/my%20notes?block-id=6650a1b2-0000-4000-8000-000000000001">ref</a>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  test('formatting, code, lists, tables, marks, images and data attributes', () => {
    const html =
      '<p><strong>bold</strong> <em>it</em> <code>x()</code> <mark>hit</mark></p>' +
      '<pre><code class="language-js">let a = 1;</code></pre>' +
      '<ul><li>one</li></ul><ol><li>two</li></ol>' +
      '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>' +
      '<blockquote>q</blockquote>' +
      '<span class="logseq-asset" title="../assets/a.png">a.png</span>' +
      '<img src="https://example.com/a.png" alt="a">' +
      '<span data-ref="x">d</span>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});
