import log from '@/utils/logger';

interface GotElementOptions {
  /** No warning when the mount point is missing (asked again and again). */
  quiet?: boolean;
}

abstract class SearchingEngine {
  abstract getId(): string;

  isMatch(): boolean {
    return false;
  }
  getQuery(): string | null {
    return null;
  }
  gotElement(_options?: GotElementOptions): Element | null {
    return null;
  }
  reload(callback: Function): null {
    return null;
  }
}

/** Google's right column (#rhs): width and gap to the results column. */
const GOOGLE_RHS_WIDTH = 369;
const GOOGLE_RHS_MARGIN = 76;
/** Narrower than this, the sidebar goes above the results instead. */
const GOOGLE_RHS_MIN_WIDTH = 300;

/**
 * Brave's right column: fixed width and gap to the results column. Brave's
 * grid does not shrink it, so without this much room right of the results
 * the column is cut off by the window edge.
 */
const BRAVE_SIDE_WIDTH = 400;
const BRAVE_SIDE_GAP = 48;
/** Brave's results and infobox start this far below the top of the columns. */
const BRAVE_TOP_GAP = 24;

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
      log.warn(
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
      log.warn(
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

  gotElement({ quiet = false }: GotElementOptions = {}): Element | null {
    try {
      // Special handling for Google's sidebar
      if (this.config.id === 'google') {
        return this.handleGoogleElement();
      }
      if (this.config.id === 'brave') {
        return this.handleBraveElement(quiet);
      }

      let targetElement = document.querySelector(this.config.elementSelector);
      if (!targetElement) {
        if (!quiet) {
          log.warn(
            `[CustomSearchEngine] Target element not found for ${this.config.name}`,
          );
        }
        return null;
      }

      // Kagi collapses its right column to width: 0 unless ._0_right_sidebar
      // has a child (`.right-content-box:not(:has(> ._0_right_sidebar > *))`).
      // A card placed next to the sidebar does not count, so it would be
      // squeezed into a zero-width box. Mount inside the sidebar instead.
      // The stored selector still points at the box, so this lives here and
      // also applies to settings saved by older versions.
      if (this.config.id === 'kagi') {
        targetElement = this.findKagiSidebar(targetElement) ?? targetElement;
      }

      let container: Element;

      // Special handling for different search engines
      if (this.config.id === 'bing') {
        // #b_context is a list of cards (li.b_ans); a plain item keeps the
        // full rail width without the card frame.
        container = document.createElement('li');
        container.className = 'logseq-copilot-custom-container';
        Object.assign((container as HTMLElement).style, {
          listStyle: 'none',
          margin: '0 0 16px',
          padding: '0',
        });
      } else if (this.config.id === 'ecosia') {
        container = document.createElement('article');
        container.className = 'logseq-copilot-custom-container';
      } else {
        container = document.createElement('div');
        container.className = 'logseq-copilot-custom-container';
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
      log.warn(
        `[CustomSearchEngine] Error creating element for ${this.config.name}:`,
        error,
      );
      return null;
    }
  }

  private findKagiSidebar(rightContentBox: Element): Element | undefined {
    return Array.from(rightContentBox.children).find((child) =>
      child.classList.contains('_0_right_sidebar'),
    );
  }

  /**
   * Google: first thing in the right column (#rhs, 369px) when there is one.
   * Most result pages have none: then a column of the same width and gap
   * next to the results (#center_col), or, when the window has no room for
   * it, the top of the results column.
   */
  private handleGoogleElement(): Element {
    const container = document.createElement('div');
    const asideElement = document.getElementById('rhs');

    if (asideElement) {
      asideElement.insertBefore(container, asideElement.firstChild);
      return container;
    }

    const centerCol = document.getElementById('center_col');
    const room = centerCol
      ? document.documentElement.clientWidth - centerCol.getBoundingClientRect().right
      : 0;
    if (centerCol && room < GOOGLE_RHS_MARGIN + GOOGLE_RHS_MIN_WIDTH) {
      centerCol.insertBefore(container, centerCol.firstChild);
      return container;
    }

    centerCol?.parentNode?.appendChild(container);
    Object.assign(container.style, {
      flex: '0 0 auto',
      width: `${Math.min(GOOGLE_RHS_WIDTH, room - GOOGLE_RHS_MARGIN)}px`,
      marginLeft: `${GOOGLE_RHS_MARGIN}px`,
    });
    return container;
  }

  /**
   * Brave Search: first thing in the right column (#mixed-side). Brave hides
   * that column while it is empty, and a card in it shows it, like Brave's
   * own infobox. When the window has no room for the column (it would be cut
   * off, and Brave hides it on narrow windows), the top of the results
   * (#mixed-main) instead.
   */
  private handleBraveElement(quiet: boolean): Element | null {
    const side = document.querySelector(this.config.elementSelector);
    const main = document.getElementById('mixed-main');
    const room = main
      ? document.documentElement.clientWidth - main.getBoundingClientRect().right
      : 0;
    const target =
      main && (!side || room < BRAVE_SIDE_GAP + BRAVE_SIDE_WIDTH) ? main : side;
    if (!target) {
      if (!quiet) {
        log.warn(`[CustomSearchEngine] Target element not found for ${this.config.name}`);
      }
      return null;
    }

    const container = document.createElement('div');
    container.className = 'logseq-copilot-custom-container';
    container.style.marginTop = `${BRAVE_TOP_GAP}px`;
    const firstResult = target === main ? target.firstElementChild : null;
    if (firstResult) {
      // Level with the text of the results, which Brave insets by the
      // padding of each result (none on the one-column layout).
      const inset =
        firstResult.getBoundingClientRect().left +
        parseFloat(getComputedStyle(firstResult).paddingLeft) -
        target.getBoundingClientRect().left;
      if (inset > 0) container.style.paddingLeft = `${inset}px`;
    }
    target.insertBefore(container, target.firstChild);
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
