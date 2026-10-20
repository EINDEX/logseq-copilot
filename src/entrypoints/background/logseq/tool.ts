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

  return result
    .replaceAll(/!\[.*?\]\(\.\.\/assets.*?\)/gim, '')
    .replaceAll(/^[\w-]+::.*?$/gim, '') // clean properties
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

const highlightTokens = (query: string) => {
  return (token: any) => {
    if (
      token.type !== 'code' &&
      token.type !== 'codespan' &&
      token.type !== 'logseqLink' &&
      token.text
    ) {
      token.text = markMatches(token.text, query);
    }
  };
};

const logseqLinkExt = (graph: string, query?: string) => {
  return {
    name: 'logseqLink',
    level: 'inline',
    tokenizer: function (src: string) {
      const match = src.match(/^#?\[\[(.*?)\]\]/);
      if (match) {
        return {
          type: 'logseqLink',
          raw: match[0],
          text: match[1],
          href: match[1].trim(),
          tokens: [],
        };
      }
      return false;
    },
    renderer: function (token: any) {
      const { text, href } = token;

      const fillText = markMatches(text, query);
      return `<a class="logseq-page-link" href="logseq://graph/${graph}?page=${href}"><span class="tie tie-page"></span>${fillText}</a>`;
    },
  };
};

/**
 * marked 4.x has no `Marked` instance class: `marked.use` mutates global
 * state, so extensions and walkTokens would accumulate between renders (a
 * second search would still highlight the previous query). Start every
 * render from pristine defaults and restore the previous global state after.
 */
const parseIsolated = (markdown: string, graphName: string, query?: string) => {
  const previous = { ...marked.defaults };
  try {
    marked.setOptions(marked.getDefaults());
    marked.use(<marked.MarkedExtension>{
      gfm: true,
      tables: true,
      walkTokens: query ? highlightTokens(query) : undefined,
      extensions: [logseqLinkExt(graphName, query)],
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
  const html = parseIsolated(cleanContent, graphName, query).trim();

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
