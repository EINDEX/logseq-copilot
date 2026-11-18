import TurndownService from 'turndown';
import { renderFlatClip } from './clip-template';
import { escapeForLogseq } from './logseq-format';

export { escapeForLogseq, logseqEscape } from './logseq-format';
export type { EscapeContext } from './logseq-format';

export const removeUrlHash = (url: string) => {
  const hashIndex = url.indexOf('#');
  return hashIndex > 0 ? url.substring(0, hashIndex) : url;
};

const mappingVersionToNumbers = (version: string): Array<number> => {
  return version
    .split('.')
    .slice(0, 3)
    .map((x) => {
      return parseInt(x.split('0')[0]);
    });
};

export const versionCompare = (versionA: string, versionB: string) => {
  const [majorA, minorA, patchA] = mappingVersionToNumbers(versionA);
  const [majorB, minorB, patchB] = mappingVersionToNumbers(versionB);
  if (majorA < majorB) return -1;
  if (majorA > majorB) return 1;
  if (minorA < minorB) return -1;
  if (minorA > minorB) return 1;
  if (patchA < patchB) return -1;
  if (patchA > patchB) return 1;
  return 0;
};

/**
 * Renders a template as a single block, the way every clip did before outline
 * templates (see renderClip in clip-template.ts for those).
 */
export function blockRending(options: {
  url?: string;
  title?: string;
  data: string;
  clipNoteTemplate: string;
  preferredDateFormat: string;
  time: Date;
}): string {
  return renderFlatClip(options.clipNoteTemplate, options);
}

export const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// https://gist.github.com/ca0v/73a31f57b397606c9813472f7493a940?permalink_comment_id=3062135#gistcomment-3062135
export const debounce = <F extends (...args: any[]) => any>(
  func: F,
  waitFor: number,
) => {
  let timeout: NodeJS.Timeout | undefined = undefined;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
};

/** The page controls a URL: write it so Logseq reads one destination. */
const linkDest = (url: string) => escapeForLogseq(url, { context: 'linkDest' });

/**
 * One image as Markdown, `![alt](src)`, escaped like the images of a clipped
 * selection: the alt text is a link label, `src` (absolute) a destination.
 */
export const imageMarkdown = (alt: string, src: string) =>
  `![${escapeForLogseq(alt, { context: 'linkText' })}](${linkDest(src)})`;

function linkProcess(src: string) {
  if (src.startsWith('/')) {
    return window.location.origin + src;
  } else if (src.startsWith('http')) {
    return src;
  } else if (src.startsWith('data')) {
    return src;
  } else {
    return window.location.href + src;
  }
}

export const buildTurndownService = () => {
  const turndownService = new TurndownService({
    bulletListMarker: '*',
    codeBlockStyle: 'fenced',
    linkStyle: 'inlined',
    headingStyle: 'atx',
    br: '\n',
  });

  turndownService.addRule('image-add-black', {
    filter: 'img',

    replacement: function (content: string, node: any) {
      // The page controls the alt text: it is the label of `![label](src)`.
      const alt = escapeForLogseq(node.getAttribute('alt') ?? '', {
        context: 'linkText',
      });
      const src = node.getAttribute('src') || '';
      return src ? ` ![${alt}](${linkDest(linkProcess(src))}) ` : '';
    },
  });

  turndownService.addRule('p-logseq', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

    replacement: function (content: string, node: any) {
      const hLevel = Number(node.nodeName.charAt(1));
      if (hLevel === 1) return '\n\n**' + content + '**\n\n';
      return '\n\n' + content + '\n\n';
    },
  });

  turndownService.addRule('a-logseq', {
    filter: 'a',

    replacement: function (content: string, node: any) {
      const href = node.getAttribute('href');
      return `[${content}](${linkDest(linkProcess(href))})`;
    },
  });

  return turndownService;
};

export const fixDuckDuckGoDark = () => {
  if (document.querySelector('.dark-bg')) {
    document.body.style.color = 'var(--theme-col-txt-snippet)';
  }
};
