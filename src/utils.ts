export const delay = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// https://gist.github.com/ca0v/73a31f57b397606c9813472f7493a940?permalink_comment_id=3062135#gistcomment-3062135
export const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
  let timeout: NodeJS.Timeout | undefined = undefined;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise(resolve => {
      if (timeout) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(() => resolve(func(...args)), waitFor)
    })
}

export const removeUrlHash = (url: string) => {
  const hashIndex = url.indexOf('#');
  return hashIndex > 0 ? url.substring(0, hashIndex) : url;
};

function cleanAttribute(attribute: string) {
  return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
}

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
  const TurndownService = require('turndown');

  const turndownService = new TurndownService({
    bulletListMarker: '*',
    codeBlockStyle: 'fenced',
    linkStyle: 'inlined',
    headingStyle: 'atx',
    br: '\n',
  });

  turndownService.addRule('image-add-black', {
    filter: 'img',

    replacement: function (content, node) {
      const alt = cleanAttribute(node.getAttribute('alt'));
      const src = node.getAttribute('src') || '';
      return src ? ` ![${alt}](${linkProcess(src)}) ` : '';
    },
  });

  turndownService.addRule('p-logseq', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

    replacement: function (content, node) {
      const hLevel = Number(node.nodeName.charAt(1));
      if (hLevel === 1) return '\n\n**' + content + '**\n\n';
      return '\n\n' + content + '\n\n';
    },
  });

  turndownService.addRule('a-logseq', {
    filter: 'a',

    replacement: function (content, node) {
      const href = node.getAttribute('href');
      return `[${content}](${linkProcess(href)})`;
    },
  });

  return turndownService;
};

export const fixDuckDuckGoDark = () => {
  if (document.querySelector('.dark-bg')) {
    document.body.style.color = 'var(--theme-col-txt-snippet)';
  }
}
