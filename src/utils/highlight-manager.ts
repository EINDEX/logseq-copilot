import { HighlightService } from './highlight-service';
import log from './logger';
import { contentEvents } from './content-events';
import type { HighlightData } from '@/types/highlight';

/**
 * Manages highlights display and restoration on web pages
 */
export class HighlightManager {
  private static instance: HighlightManager | null = null;
  private highlights: HighlightRegistry;
  private highlightMap: Map<string, Highlight> = new Map();
  private isInitialized = false;
  private clickEventListener: ((event: MouseEvent) => void) | null = null;

  private constructor() {
    this.highlights = CSS.highlights;
    this.setupClickListener();
  }

  /**
   * Get or create the singleton instance
   */
  static getInstance(): HighlightManager {
    if (!HighlightManager.instance) {
      HighlightManager.instance = new HighlightManager();
    }
    return HighlightManager.instance;
  }

  /**
   * Check if the browser supports the CSS Highlight API
   */
  static isSupported(): boolean {
    return 'highlights' in CSS && typeof CSS.highlights !== 'undefined';
  }

  /**
   * Setup click listener for highlights
   */
  private setupClickListener(): void {
    this.clickEventListener = (event: MouseEvent) => {
      this.handleHighlightClick(event);
    };
    document.addEventListener('click', this.clickEventListener);
  }

  /**
   * Handle click events on highlights
   */
  private async handleHighlightClick(event: MouseEvent): Promise<void> {
    // Ignore synthetic clicks dispatched by page scripts.
    if (!event.isTrusted) return;

    // Skip if the click was on UI elements (like buttons)
    const target = event.target as Element;
    if (!target) return;

    // Skip if clicking on extension UI elements
    if (
      target.closest('.quickCapture') ||
      target.closest('[data-highlight-popup]') ||
      target.closest('#logseq-copilot-popup')
    ) {
      return;
    }

    console.log(
      '[HighlightManager] Click detected at',
      event.clientX,
      event.clientY,
    );

    const clickedRange = document.caretRangeFromPoint(
      event.clientX,
      event.clientY,
    );
    if (!clickedRange) {
      console.log('[HighlightManager] No range found at click point');
      return;
    }

    // Find the highlight that contains this clicked point
    const pageHighlights = await this.getPageHighlights();
    console.log(
      '[HighlightManager] Found',
      pageHighlights.length,
      'highlights on page',
    );
    console.log('[HighlightManager] Current URL:', window.location.href);
    console.log('[HighlightManager] Page highlights data:', pageHighlights);

    for (const highlightData of pageHighlights) {
      const range = HighlightService.deserializeRange(highlightData.range);
      if (range) {
        console.log(
          '[HighlightManager] Checking highlight:',
          highlightData.id,
          range.toString(),
        );

        if (this.rangeContainsPoint(range, clickedRange)) {
          console.log(
            '[HighlightManager] Clicked on highlight:',
            highlightData.id,
          );

          // Prevent text selection when clicking on highlights
          event.preventDefault();

          // Notify the comment popup through the in-memory content-script
          // event bus (not a DOM event, which page scripts could forge).
          contentEvents.emit('showHighlightComment', {
            highlightData,
            clickPosition: { x: event.clientX, y: event.clientY },
          });
          break;
        }
      } else {
        console.log(
          '[HighlightManager] Could not deserialize range for highlight:',
          highlightData.id,
        );
      }
    }
  }

  /**
   * Check if a range contains a specific point using a simpler method
   */
  private rangeContainsPoint(range: Range, point: Range): boolean {
    try {
      // Create a temporary range to test intersection
      const tempRange = document.createRange();
      tempRange.selectNodeContents(document.body);

      // Check if ranges intersect by comparing their positions
      const highlightRect = range.getBoundingClientRect
        ? range.getBoundingClientRect()
        : null;
      const pointRect = point.getBoundingClientRect
        ? point.getBoundingClientRect()
        : null;

      if (highlightRect && pointRect) {
        const intersects = !(
          pointRect.right < highlightRect.left ||
          pointRect.left > highlightRect.right ||
          pointRect.bottom < highlightRect.top ||
          pointRect.top > highlightRect.bottom
        );

        console.log('[HighlightManager] Rectangle intersection check:', {
          highlightRect,
          pointRect,
          intersects,
        });

        return intersects;
      }

      // Fallback: use text comparison
      const highlightText = range.toString().trim();
      const pointNode = point.startContainer;

      if (pointNode && pointNode.textContent) {
        const containsText =
          pointNode.textContent.includes(highlightText) ||
          highlightText.includes(pointNode.textContent.trim());

        console.log('[HighlightManager] Text comparison check:', {
          highlightText,
          pointText: pointNode.textContent.trim(),
          containsText,
        });

        return containsText;
      }

      return false;
    } catch (error) {
      console.log('[HighlightManager] Range comparison error:', error);

      // Simple fallback: compare text content
      try {
        const highlightText = range.toString().trim();
        const pointText = point.toString().trim();
        return highlightText.includes(pointText) && pointText.length > 0;
      } catch (fallbackError) {
        log.debug(
          '[HighlightManager] Fallback comparison error:',
          fallbackError,
        );
        return false;
      }
    }
  }

  /**
   * Initialize the highlight manager and restore saved highlights
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!HighlightManager.isSupported()) {
      log.warn('[HighlightManager] CSS Highlight API not supported');
      return;
    }

    try {
      await this.restoreHighlights();
      this.isInitialized = true;
      log.debug('[HighlightManager] Initialized and restored highlights');
    } catch (error) {
      log.error('[HighlightManager] Failed to initialize:', error);
    }
  }

  /**
   * Restore all saved highlights for the current page
   */
  async restoreHighlights(): Promise<void> {
    try {
      const pageHighlights = await HighlightService.getCurrentPageHighlights();

      for (const highlightData of pageHighlights) {
        await this.displayHighlight(highlightData);
      }

      log.debug(
        `[HighlightManager] Restored ${pageHighlights.length} highlights`,
      );
    } catch (error) {
      log.error('[HighlightManager] Failed to restore highlights:', error);
    }
  }

  /**
   * Display a highlight on the page
   */
  async displayHighlight(highlightData: HighlightData): Promise<boolean> {
    try {
      const range = HighlightService.deserializeRange(highlightData.range);
      if (!range) {
        log.warn(
          `[HighlightManager] Could not restore range for highlight ${highlightData.id}`,
        );
        return false;
      }

      // Create or get existing highlight object
      let highlight = this.highlightMap.get(highlightData.id);
      if (!highlight) {
        highlight = new Highlight();
        this.highlightMap.set(highlightData.id, highlight);
      }

      // Add the range to the highlight
      highlight.add(range);

      // Register the highlight with CSS.highlights
      const highlightName = this.getHighlightName(highlightData);
      this.highlights.set(highlightName, highlight);

      // Inject CSS for this specific highlight if not already done
      this.injectHighlightCSS(highlightName, highlightData.color || 'yellow');

      // Update last accessed time
      await HighlightService.updateLastAccessed(highlightData.id);

      log.debug(`[HighlightManager] Displayed highlight ${highlightData.id}`);
      return true;
    } catch (error) {
      log.error(
        `[HighlightManager] Failed to display highlight ${highlightData.id}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Add a new highlight and save it
   */
  async addHighlight(
    range: Range,
    note?: string,
    tags?: string[],
  ): Promise<HighlightData | null> {
    try {
      // Save the highlight data
      const result = await HighlightService.saveHighlight(range, note, tags);

      if (!result.success || !result.data) {
        log.error(
          '[HighlightManager] Failed to save highlight:',
          result.message,
        );
        return null;
      }

      const highlightData = result.data as HighlightData;

      // Display the highlight immediately
      await this.displayHighlight(highlightData);

      log.debug(`[HighlightManager] Added new highlight ${highlightData.id}`);
      return highlightData;
    } catch (error) {
      log.error('[HighlightManager] Failed to add highlight:', error);
      return null;
    }
  }

  /**
   * Remove a highlight from display and storage
   */
  async removeHighlight(highlightId: string): Promise<boolean> {
    try {
      // Remove from display
      const highlightName = this.getHighlightNameById(highlightId);
      if (highlightName) {
        this.highlights.delete(highlightName);
      }

      this.highlightMap.delete(highlightId);

      // Remove from storage
      const result = await HighlightService.deleteHighlight(highlightId);

      if (result.success) {
        log.debug(`[HighlightManager] Removed highlight ${highlightId}`);
        
        // Notify the sidebar of the removed highlight
        contentEvents.emit('highlightRemoved', { highlightId });
        
        return true;
      } else {
        log.error(
          `[HighlightManager] Failed to remove highlight ${highlightId}:`,
          result.message,
        );
        return false;
      }
    } catch (error) {
      log.error(
        `[HighlightManager] Failed to remove highlight ${highlightId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Clear all highlights from the current page
   */
  async clearPageHighlights(): Promise<boolean> {
    try {
      const pageHighlights = await HighlightService.getCurrentPageHighlights();

      for (const highlight of pageHighlights) {
        const highlightName = this.getHighlightName(highlight);
        this.highlights.delete(highlightName);
        this.highlightMap.delete(highlight.id);
      }

      // Clear from storage
      const result = await HighlightService.clearHighlights({
        url: window.location.href,
      });

      if (result.success) {
        log.debug('[HighlightManager] Cleared all page highlights');
        return true;
      } else {
        log.error(
          '[HighlightManager] Failed to clear page highlights:',
          result.message,
        );
        return false;
      }
    } catch (error) {
      log.error('[HighlightManager] Failed to clear page highlights:', error);
      return false;
    }
  }

  /**
   * Get all highlights for the current page
   */
  async getPageHighlights(): Promise<HighlightData[]> {
    return HighlightService.getCurrentPageHighlights();
  }

  /**
   * Scroll to a specific highlight on the page
   */
  async scrollToHighlight(highlightId: string): Promise<boolean> {
    try {
      // Find the highlight in our map
      const highlight = this.highlightMap.get(highlightId);
      if (!highlight) {
        log.warn(`[HighlightManager] Highlight ${highlightId} not found in map`);
        return false;
      }

      // Get the first range from the highlight
      const ranges = Array.from(highlight);
      if (ranges.length === 0) {
        log.warn(`[HighlightManager] No ranges found for highlight ${highlightId}`);
        return false;
      }

      const firstRange = ranges[0];
      
      // Get the container element
      const startContainer = firstRange.startContainer;
      const element = startContainer.nodeType === Node.TEXT_NODE 
        ? startContainer.parentElement 
        : startContainer as Element;

      if (!element) {
        log.warn(`[HighlightManager] No element found for highlight ${highlightId}`);
        return false;
      }

      // Scroll the element into view with smooth behavior
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'nearest'
      });

      // Flash the highlight to indicate it's been found
      await this.flashHighlight(highlightId);

      log.debug(`[HighlightManager] Scrolled to highlight ${highlightId}`);
      return true;
    } catch (error) {
      log.error(`[HighlightManager] Failed to scroll to highlight ${highlightId}:`, error);
      return false;
    }
  }

  /**
   * Flash a highlight to draw attention to it
   */
  private async flashHighlight(highlightId: string): Promise<void> {
    try {
      const highlightName = this.getHighlightNameById(highlightId);
      if (!highlightName) return;

      // Temporarily change the highlight style to create a flash effect
      const flashCSS = `
        ::highlight(${highlightName}) {
          background-color: rgba(59, 130, 246, 0.6) !important;
          animation: highlight-flash 1s ease-out;
        }
        
        @keyframes highlight-flash {
          0% { background-color: rgba(59, 130, 246, 0.8); }
          50% { background-color: rgba(59, 130, 246, 0.4); }
          100% { background-color: rgba(255, 255, 0, 0.3); }
        }
      `;

      // Inject the flash animation
      let flashStyleElement = document.getElementById('highlight-flash-animation');
      if (!flashStyleElement) {
        flashStyleElement = document.createElement('style');
        flashStyleElement.id = 'highlight-flash-animation';
        document.head.appendChild(flashStyleElement);
      }
      
      flashStyleElement.textContent = flashCSS;

      // Remove the flash animation after it completes
      setTimeout(() => {
        if (flashStyleElement && flashStyleElement.parentNode) {
          flashStyleElement.remove();
        }
      }, 1000);
    } catch (error) {
      log.error('[HighlightManager] Failed to flash highlight:', error);
    }
  }

  /**
   * Generate a CSS highlight name for a highlight
   */
  private getHighlightName(highlightData: HighlightData): string {
    return `logseq-highlight-${highlightData.id}`;
  }

  /**
   * Inject CSS styles for a specific highlight
   */
  private injectHighlightCSS(highlightName: string, color: string): void {
    try {
      // Check if CSS for this highlight already exists
      const existingStyle = document.querySelector(
        `style[data-highlight="${highlightName}"]`,
      );
      if (existingStyle) {
        return;
      }

      // Create CSS style element
      const style = document.createElement('style');
      style.setAttribute('data-highlight', highlightName);

      // Define color mappings
      const colorMap: Record<string, { light: string; dark: string }> = {
        yellow: {
          light: 'rgba(255, 255, 0, 0.4)',
          dark: 'rgba(255, 255, 0, 0.25)',
        },
        green: { light: 'rgba(0, 255, 0, 0.4)', dark: 'rgba(0, 255, 0, 0.25)' },
        blue: { light: 'rgba(0, 0, 255, 0.4)', dark: 'rgba(0, 0, 255, 0.25)' },
        pink: {
          light: 'rgba(255, 192, 203, 0.4)',
          dark: 'rgba(255, 192, 203, 0.25)',
        },
        orange: {
          light: 'rgba(255, 165, 0, 0.4)',
          dark: 'rgba(255, 165, 0, 0.25)',
        },
      };

      const colors = colorMap[color] || colorMap.yellow;

      // Create CSS rules for the highlight
      const css = `
        ::highlight(${highlightName}) {
          background-color: ${colors.light};
          color: inherit;
        }
        
        [data-theme-container].dark ::highlight(${highlightName}) {
          background-color: ${colors.dark};
          color: inherit;
        }
      `;

      style.textContent = css;
      document.head.appendChild(style);

      log.debug(
        `[HighlightManager] Injected CSS for highlight ${highlightName}`,
      );
    } catch (error) {
      log.error(
        `[HighlightManager] Failed to inject CSS for highlight ${highlightName}:`,
        error,
      );
    }
  }

  /**
   * Find highlight name by ID
   */
  private getHighlightNameById(highlightId: string): string | null {
    const highlightName = `logseq-highlight-${highlightId}`;
    return this.highlights.has(highlightName) ? highlightName : null;
  }

  /**
   * Add temporary highlight (not saved) for quick capture
   */
  addTemporaryHighlight(range: Range): void {
    try {
      if (!this.highlights.has('copilot-highlight')) {
        this.highlights.set('copilot-highlight', new Highlight());
      }

      const highlight = this.highlights.get('copilot-highlight');
      if (highlight) {
        // Clear previous temporary highlights
        highlight.clear();
        highlight.add(range);
      }
    } catch (error) {
      log.debug(
        '[HighlightManager] Platform does not support highlight function',
        error,
      );
    }
  }

  /**
   * Clear temporary highlights
   */
  clearTemporaryHighlights(): void {
    try {
      const highlight = this.highlights.get('copilot-highlight');
      if (highlight) {
        highlight.clear();
      }
    } catch (error) {
      log.debug(
        '[HighlightManager] Platform does not support highlight function',
        error,
      );
    }
  }

  /**
   * Clean up and remove all highlights
   */
  cleanup(): void {
    try {
      // Remove click event listener
      if (this.clickEventListener) {
        document.removeEventListener('click', this.clickEventListener);
        this.clickEventListener = null;
      }

      // Clear all registered highlights
      for (const [name] of this.highlights) {
        if (
          name.startsWith('logseq-highlight-') ||
          name === 'copilot-highlight'
        ) {
          this.highlights.delete(name);
        }
      }

      this.highlightMap.clear();
      this.isInitialized = false;

      log.debug('[HighlightManager] Cleaned up');
    } catch (error) {
      log.error('[HighlightManager] Failed to cleanup:', error);
    }
  }
}
