import { LogseqBlockType } from '@/types/logseqBlock';

import { marked } from 'marked';
import LogseqClient from './client';
import LogseqDBService from './db/service';
import LogseqService from './markdown/service';
import { LogseqServiceInterface } from './interfaces';

const client = new LogseqClient();
const logseqServiceDB = new LogseqDBService();
const logseqService = new LogseqService();

export const cleanBlock = (block: LogseqBlockType): string => {
  let result = block.content;
  if (!result) {
    return '';
  }
  if (block.marker) {
    result = result.replace(block.marker, '');
  }

  if (block.priority) {
    result = result.replace(`[#${block.priority}]`, '');
  }

  // Local asset images (../assets/...) stay: the renderer turns them into a
  // placeholder, the extension cannot load files from the graph folder.
  return result
    .replaceAll(/^[\w-]+::.*?$/gim, '') // clean properties (hidden, not shown)
    .replaceAll(/{{renderer .*?}}/gim, '') // clean renderer
    .replaceAll(/^deadline: <.*?>$/gim, '') // clean deadline
    .replaceAll(/^scheduled: <.*?>$/gim, '') // clean schedule
    .replaceAll(/^:logbook:[\S\s]*?:end:$/gim, '') // clean logbook
    .replaceAll(/^:LOGBOOK:[\S\s]*?:END:$/gim, '') // clean logbook
    .replaceAll(/\$pfts_2lqh>\$(.*?)\$<pfts_2lqh\$/gim, '<em>$1</em>') // clean highlight
    .replaceAll(/{{video .*?}}/gm, '')
    .replaceAll(/^\s*?-\s*?$/gim, '')
    .trim();
};

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Wrap every occurrence of `query` in `<mark>`. Existing `<mark>…</mark>`
 * segments are left untouched so nothing is wrapped twice.
 */
export const markMatches = (text: string, query?: string): string => {
  if (!query || !text) {
    return text;
  }
  const re = new RegExp(`(<mark>[\\s\\S]*?<\\/mark>)|${escapeRegExp(query)}`, 'g');
  return text.replace(re, (match, existing) =>
    existing ? match : `<mark>${match}</mark>`,
  );
};

// Tokens whose text is markup or a URL, not readable text: a <mark> in there
// would break the HTML or the link.
const NO_HIGHLIGHT = new Set(['code', 'codespan', 'html', 'image', 'logseqLink', 'logseqTag', 'logseqBlockRef']);

const highlightTokens = (query: string) => {
  return (token: any) => {
    if (!NO_HIGHLIGHT.has(token.type) && token.text) {
      token.text = markMatches(token.text, query);
    }
  };
};

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const logseqUrl = (graph: string, param: 'page' | 'block-id', value: string) =>
  `logseq://graph/${encodeURIComponent(graph)}?${param}=${encodeURIComponent(value)}`;

/** Index of the first match of `re` in `src`, skipping the `skip` group. */
const startOf = (src: string, re: RegExp) => {
  const match = src.match(re);
  return match ? match.index! + (match[1]?.length ?? 0) : undefined;
};

const BLOCK_REF_RE =
  /\(\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\)/gi;

/** UUIDs of the `((uuid))` block references in `content`, without repeats. */
export const blockRefUuids = (content?: string): string[] =>
  [...new Set([...(content ?? '').matchAll(BLOCK_REF_RE)].map((m) => m[1]))];

/** One line of plain text for a referenced block (shown as the ref label). */
export const blockRefTitle = (block?: Partial<LogseqBlockType> | null) => {
  if (!block?.content) return '';
  const text = cleanBlock({ ...block, content: block.content } as LogseqBlockType)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!text) return '';
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
};

/**
 * Fill `block.refTitles` with the text of every block the content references
 * as `((uuid))`. `getBlock` reads a block; refs that cannot be read keep no
 * title and render as a short "block" link.
 */
export const resolveBlockRefs = async (
  block: LogseqBlockType,
  getBlock: (uuid: string) => Promise<Partial<LogseqBlockType> | null | undefined>,
) => {
  const uuids = blockRefUuids(block.content);
  if (uuids.length === 0) return block;
  const titles: Record<string, string> = {};
  await Promise.all(
    uuids.map(async (uuid) => {
      try {
        const title = blockRefTitle(await getBlock(uuid));
        if (title) titles[uuid] = title;
      } catch {
        // unreadable ref: rendered without its text
      }
    }),
  );
  block.refTitles = titles;
  return block;
};

/**
 * Logseq inline syntax: `[[page]]`, `#[[tag page]]`, `#tag` and `((block
 * uuid))`. Page refs and tags become links that open the page in Logseq,
 * block refs show the referenced text and open the block.
 */
const logseqExtensions = (
  graph: string,
  query?: string,
  refTitles: Record<string, string> = {},
) => {
  const highlight = (text: string) => markMatches(escapeHtml(text), query);
  return [
    {
      name: 'logseqLink',
      level: 'inline',
      start: (src: string) => startOf(src, /()#?\[\[/),
      tokenizer(src: string) {
        const match = src.match(/^(#?)\[\[(.*?)\]\]/);
        if (match) {
          return {
            type: 'logseqLink',
            raw: match[0],
            text: match[2],
            tag: match[1] === '#',
            href: match[2].trim(),
            tokens: [],
          };
        }
        return false;
      },
      renderer(token: any) {
        const label = token.tag ? `#${token.text}` : token.text;
        const cls = token.tag ? 'logseq-tag' : 'logseq-page-link';
        return `<a class="${cls}" href="${logseqUrl(graph, 'page', token.href)}">${highlight(label)}</a>`;
      },
    },
    {
      name: 'logseqTag',
      level: 'inline',
      start: (src: string) => startOf(src, /()#(?=[^\s#[\]])/),
      // A tag starts the text or follows whitespace: `a#b` and URL
      // fragments are not tags.
      tokenizer(src: string, tokens: any[]) {
        const before = tokens[tokens.length - 1]?.raw ?? '';
        if (before && !/[\s(]$/.test(before)) return false;
        const match = src.match(/^#([^\s#,.!?;:()[\]{}"'<>]+)/);
        if (match) {
          return { type: 'logseqTag', raw: match[0], text: match[1], tokens: [] };
        }
        return false;
      },
      renderer(token: any) {
        return `<a class="logseq-tag" href="${logseqUrl(graph, 'page', token.text)}">${highlight(`#${token.text}`)}</a>`;
      },
    },
    {
      name: 'logseqBlockRef',
      level: 'inline',
      start: (src: string) => startOf(src, /()\(\(/),
      tokenizer(src: string) {
        const match = src.match(/^\(\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\)/i);
        if (match) {
          return { type: 'logseqBlockRef', raw: match[0], text: match[1], tokens: [] };
        }
        return false;
      },
      renderer(token: any) {
        const title = refTitles[token.text];
        return `<a class="logseq-block-ref" href="${logseqUrl(graph, 'block-id', token.text)}">${title ? highlight(title) : 'block'}</a>`;
      },
    },
  ];
};

/** Images from the graph's own assets folder cannot be loaded: show a label. */
const assetImageRenderer = {
  image(href: string | null, _title: string | null, text: string) {
    if (!href?.startsWith('../assets/')) return false;
    const name = text || href.split('/').pop() || 'image';
    return `<span class="logseq-asset" title="${escapeHtml(href)}">${escapeHtml(name)}</span>`;
  },
};

/**
 * marked 4.x has no `Marked` instance class: `marked.use` mutates global
 * state, so extensions and walkTokens would accumulate between renders (a
 * second search would still highlight the previous query). Start every
 * render from pristine defaults and restore the previous global state after.
 */
const parseIsolated = (
  markdown: string,
  graphName: string,
  query?: string,
  refTitles?: Record<string, string>,
) => {
  const previous = { ...marked.defaults };
  try {
    marked.setOptions(marked.getDefaults());
    marked.use(<marked.MarkedExtension>{
      gfm: true,
      tables: true,
      // Logseq shows every line of a block on its own line.
      breaks: true,
      walkTokens: query ? highlightTokens(query) : undefined,
      extensions: logseqExtensions(graphName, query, refTitles),
      renderer: assetImageRenderer as any,
    });
    return marked.parse(markdown);
  } finally {
    marked.setOptions(previous);
  }
};

export const renderBlock = (
  block: LogseqBlockType,
  graphName: string,
  query?: string,
) => {
  const cleanContent = cleanBlock(block);
  const html = parseIsolated(cleanContent, graphName, query, block.refTitles).trim();

  block.html = html;
  return block;
};

export const getLogseqService = async (config?: LogseqCopliotSettingsV1): Promise<LogseqServiceInterface> => {
  try {
    const resp = await client.isDBGraph();
    if (resp === 'true' || resp === true) {
      return logseqServiceDB;
    }
  } catch (error) {}
  return logseqService;
};
