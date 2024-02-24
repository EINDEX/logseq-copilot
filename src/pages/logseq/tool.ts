import { LogseqBlockType } from '../../types/logseqBlock';

import { marked } from 'marked';

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
    .replaceAll(/^\s*?-\s*?$/gim, '')
    .trim();
};

const highlightTokens = (query: string) => {
  const re = new RegExp(`^(?!<mark>)${query}(?!<\/mark>)`, 'g');
  return (token) => {
    if (
      token.type !== 'code' &&
      token.type !== 'codespan' &&
      token.type !== 'logseqLink' &&
      token.text
    ) {
      token.text = query
        ? token.text.replaceAll(re, '<mark>' + query + '</mark>')
        : token.text;
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
    renderer: function (token) {
      const { text, href } = token;

      const fillText = query
        ? text.replaceAll(query, '<mark>' + query + '</mark>')
        : text;
      return `<a class="logseq-page-link" href="logseq://graph/${graph}?page=${href}"><span class="tie tie-page"></span>${fillText}</a>`;
    },
  };
};

export const renderBlock = (
  block: LogseqBlockType,
  graphName: string,
  query?: string,
) => {
  const cleanContent = cleanBlock(block);
  marked.use({
    gfm: true,
    tables: true,
    walkTokens: query ? highlightTokens(query) : undefined,
    extensions: [logseqLinkExt(graphName, query)],
  });
  const html = marked.parse(cleanContent).trim();

  block.html = html;
  return block;
};
