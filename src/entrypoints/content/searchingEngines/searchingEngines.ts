abstract class SearchingEngine {
  abstract getId(): string;

  isMatch(): boolean {
    return false;
  }
  getQuery(): string | null {
    return null;
  }
  gotElement(): Element | null {
    return null;
  }
  reload(callback: Function): null {
    return null;
  }
}

class CustomSearchEngine extends SearchingEngine {
  private config: {
    id: string;
    name: string;
    urlPattern: string;
    querySelector: string;
    elementSelector: string;
    insertPosition: 'before' | 'after' | 'first' | 'last';
  };

  constructor(config: {
    id: string;
    name: string;
    urlPattern: string;
    querySelector: string;
    elementSelector: string;
    insertPosition: 'before' | 'after' | 'first' | 'last';
  }) {
    super();
    this.config = config;
  }

  getId(): string {
    return this.config.id;
  }

  isMatch(): boolean {
    try {
      // Special handling for SearX
      if (this.config.id === 'searx') {
        return this.handleSearXMatch();
      }

      // Try to match as regex pattern first
      const regex = new RegExp(this.config.urlPattern, 'i');
      if (
        regex.test(window.location.href) ||
        regex.test(window.location.hostname)
      ) {
        return true;
      }

      // Fallback to simple hostname matching
      return window.location.hostname.includes(this.config.urlPattern);
    } catch (error) {
      console.warn(
        `[CustomSearchEngine] Invalid URL pattern for ${this.config.name}:`,
        error,
      );
      return false;
    }
  }

  private handleSearXMatch(): boolean {
    // Check if the website is using the searx engine
    const meta = document.querySelector('head > meta[name="generator"]');
    if (meta && meta.getAttribute('content')?.includes('searxng')) {
      return true;
    }
    // Check if the website is using the searx engine
    const match = !!window.location.hostname.match(/^searx(ng)?\./);
    return !!match;
  }

  getQuery(): string | null {
    try {
      // Special handling for SearX
      if (this.config.id === 'searx') {
        return this.handleSearXQuery();
      }

      const querySelector = this.config.querySelector;

      // If it starts with '?', treat as URL parameter
      if (querySelector.startsWith('?')) {
        const paramName = querySelector.substring(1);
        const searchParams = new URLSearchParams(window.location.search);
        return searchParams.get(paramName);
      }

      // Otherwise, treat as CSS selector
      const element = document.querySelector(querySelector);
      if (element) {
        // Try to get value from input elements
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          return element.value;
        }
        // Special handling for elements with value attribute
        const value = element.getAttribute('value');
        if (value) {
          return value;
        }
        // Otherwise get text content
        return element.textContent?.trim() || null;
      }

      return null;
    } catch (error) {
      console.warn(
        `[CustomSearchEngine] Error getting query for ${this.config.name}:`,
        error,
      );
      return null;
    }
  }

  private handleSearXQuery(): string | null {
    const searchUrlDom = document.getElementById('search_url');
    if (searchUrlDom) {
      const searchUrl = new URL(
        searchUrlDom.getElementsByTagName('pre')[0].innerHTML,
      );
      return searchUrl.searchParams.get('q');
    }

    const searchUrl = new URL(window.location.href);
    const query = searchUrl.searchParams.get('q');
    return query;
  }

  gotElement(): Element | null {
    try {
      // Special handling for Google's sidebar
      if (this.config.id === 'google') {
        return this.handleGoogleElement();
      }

      const targetElement = document.querySelector(this.config.elementSelector);
      if (!targetElement) {
        console.warn(
          `[CustomSearchEngine] Target element not found for ${this.config.name}`,
        );
        return null;
      }

      let container: Element;

      // Special handling for different search engines
      if (this.config.id === 'bing') {
        container = document.createElement('li');
        container.className = 'b_ans';
      } else if (this.config.id === 'ecosia') {
        container = document.createElement('article');
        container.className = 'logseq-copilot-custom-container';
      } else {
        container = document.createElement('div');
        container.className = 'logseq-copilot-custom-container';

        if (this.config.id === 'duckduckgo') {
          (container as HTMLElement).style.marginLeft = '8px';
        }
      }

      switch (this.config.insertPosition) {
        case 'before':
          targetElement.parentNode?.insertBefore(container, targetElement);
          break;
        case 'after':
          targetElement.parentNode?.insertBefore(
            container,
            targetElement.nextSibling,
          );
          break;
        case 'first':
          targetElement.insertBefore(container, targetElement.firstChild);
          break;
        case 'last':
        default:
          targetElement.appendChild(container);
          break;
      }

      return container;
    } catch (error) {
      console.warn(
        `[CustomSearchEngine] Error creating element for ${this.config.name}:`,
        error,
      );
      return null;
    }
  }

  private handleGoogleElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.getElementById('rhs');

    const hasAside = !!asideElement;

    if (hasAside) {
      asideElement.insertBefore(container, asideElement.firstChild);
    } else {
      const noAsideElement = document.getElementById('center_col');
      noAsideElement?.parentNode?.appendChild(container);
      container.id = 'rhs';
      container.style.width = '372px';
    }
    return container;
  }

  reload(callback: Function): null {
    // Special handling for Baidu's reload functionality
    if (this.config.id === 'baidu') {
      const targetNode = document.getElementById('wrapper_wrapper');
      if (targetNode) {
        const observer = new MutationObserver(function (records) {
          for (const record of records) {
            if (record.type === 'childList') {
              for (const node of record.addedNodes) {
                if ('id' in node && node.id === 'container') {
                  callback();
                  return null;
                }
              }
            }
          }
        });
        observer.observe(targetNode, { childList: true });
      }
    }
    return null;
  }
}

// All search engines are now configuration-based
export default [];
export { CustomSearchEngine };
