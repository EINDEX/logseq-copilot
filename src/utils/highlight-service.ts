import { highlights } from './storage';
import log from './logger';
import type {
  HighlightData,
  SerializableRange,
  HighlightQueryOptions,
  HighlightOperationResult,
} from '@/types/highlight';

/**
 * Utility class for managing persistent highlights
 */
export class HighlightService {
  /**
   * Generate a unique ID for a highlight
   */
  private static generateId(): string {
    return `highlight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert XPath to an element
   */
  private static getElementByXPath(xpath: string): Node | null {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue;
    } catch (error) {
      log.warn(
        '[HighlightService] Failed to find element by XPath:',
        xpath,
        error,
      );
      return null;
    }
  }

  /**
   * Generate XPath for a given node
   */
  private static getXPathForNode(node: Node): string {
    if (node === document.documentElement) {
      return '/html';
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode;
      if (!parent) return '';

      const textNodes = Array.from(parent.childNodes).filter(
        (child) => child.nodeType === Node.TEXT_NODE,
      );
      const index = textNodes.indexOf(node as ChildNode);
      return `${HighlightService.getXPathForNode(parent)}/text()[${index + 1}]`;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      const parent = element.parentNode;

      if (!parent) return `/${tagName}`;

      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName.toLowerCase() === tagName,
      );
      const index = siblings.indexOf(element);

      return `${HighlightService.getXPathForNode(parent)}/${tagName}[${
        index + 1
      }]`;
    }

    return '';
  }

  /**
   * Serialize a Range object to be stored
   */
  static serializeRange(range: Range): SerializableRange | null {
    try {
      return {
        startContainerXPath: HighlightService.getXPathForNode(
          range.startContainer,
        ),
        endContainerXPath: HighlightService.getXPathForNode(range.endContainer),
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        textContent: range.toString(),
      };
    } catch (error) {
      log.error('[HighlightService] Failed to serialize range:', error);
      return null;
    }
  }

  /**
   * Deserialize stored range data back to a Range object
   */
  static deserializeRange(serializedRange: SerializableRange): Range | null {
    try {
      const startContainer = HighlightService.getElementByXPath(
        serializedRange.startContainerXPath,
      );
      const endContainer = HighlightService.getElementByXPath(
        serializedRange.endContainerXPath,
      );

      if (!startContainer || !endContainer) {
        log.warn('[HighlightService] Could not find containers for range');
        return null;
      }

      const range = document.createRange();
      range.setStart(startContainer, serializedRange.startOffset);
      range.setEnd(endContainer, serializedRange.endOffset);

      // Verify the range produces the expected text
      if (range.toString() !== serializedRange.textContent) {
        log.warn(
          '[HighlightService] Range text content mismatch, page structure may have changed',
        );
        // Still return the range as it might be partially useful
      }

      return range;
    } catch (error) {
      log.error('[HighlightService] Failed to deserialize range:', error);
      return null;
    }
  }

  /**
   * Save a new highlight
   */
  static async saveHighlight(
    range: Range,
    note?: string,
    tags?: string[],
  ): Promise<HighlightOperationResult> {
    try {
      const serializedRange = HighlightService.serializeRange(range);
      if (!serializedRange) {
        return {
          success: false,
          message: 'Failed to serialize range',
        };
      }

      const highlight: HighlightData = {
        id: HighlightService.generateId(),
        url: window.location.href,
        title: document.title,
        hostname: window.location.hostname,
        range: serializedRange,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        note,
        tags,
        color: 'yellow', // Default color
      };

      const existingHighlights = await highlights.getValue();
      const updatedHighlights = [...existingHighlights, highlight];
      await highlights.setValue(updatedHighlights);

      log.debug('[HighlightService] Highlight saved:', highlight.id);
      return {
        success: true,
        message: 'Highlight saved successfully',
        data: highlight,
      };
    } catch (error) {
      log.error('[HighlightService] Failed to save highlight:', error);
      return {
        success: false,
        message: 'Failed to save highlight',
      };
    }
  }

  /**
   * Get highlights with optional filtering
   */
  static async getHighlights(
    options: HighlightQueryOptions = {},
  ): Promise<HighlightData[]> {
    try {
      let allHighlights = await highlights.getValue();

      // Apply filters
      if (options.url) {
        allHighlights = allHighlights.filter((h) => h.url === options.url);
      }

      if (options.hostname) {
        allHighlights = allHighlights.filter(
          (h) => h.hostname === options.hostname,
        );
      }

      if (options.tags && options.tags.length > 0) {
        allHighlights = allHighlights.filter(
          (h) => h.tags && h.tags.some((tag) => options.tags!.includes(tag)),
        );
      }

      // Apply sorting
      const sortBy = options.sortBy || 'createdAt';
      const sortOrder = options.sortOrder || 'desc';

      allHighlights.sort((a, b) => {
        const valueA = a[sortBy];
        const valueB = b[sortBy];
        const comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });

      // Apply limit
      if (options.limit && options.limit > 0) {
        allHighlights = allHighlights.slice(0, options.limit);
      }

      return allHighlights;
    } catch (error) {
      log.error('[HighlightService] Failed to get highlights:', error);
      return [];
    }
  }

  /**
   * Get highlights for the current page
   */
  static async getCurrentPageHighlights(): Promise<HighlightData[]> {
    return HighlightService.getHighlights({
      url: window.location.href,
    });
  }

  /**
   * Delete a highlight by ID
   */
  static async deleteHighlight(id: string): Promise<HighlightOperationResult> {
    try {
      const existingHighlights = await highlights.getValue();
      const filteredHighlights = existingHighlights.filter((h) => h.id !== id);

      if (filteredHighlights.length === existingHighlights.length) {
        return {
          success: false,
          message: 'Highlight not found',
        };
      }

      await highlights.setValue(filteredHighlights);
      log.debug('[HighlightService] Highlight deleted:', id);

      return {
        success: true,
        message: 'Highlight deleted successfully',
      };
    } catch (error) {
      log.error('[HighlightService] Failed to delete highlight:', error);
      return {
        success: false,
        message: 'Failed to delete highlight',
      };
    }
  }

  /**
   * Update highlight data
   */
  static async updateHighlight(
    id: string,
    updates: Partial<Pick<HighlightData, 'note' | 'tags' | 'color'>>
  ): Promise<HighlightOperationResult> {
    try {
      const existingHighlights = await highlights.getValue();
      const highlightIndex = existingHighlights.findIndex((h) => h.id === id);

      if (highlightIndex === -1) {
        return {
          success: false,
          message: 'Highlight not found',
        };
      }

      // Update the highlight
      existingHighlights[highlightIndex] = {
        ...existingHighlights[highlightIndex],
        ...updates,
        lastAccessedAt: Date.now(),
      };

      await highlights.setValue(existingHighlights);
      log.debug('[HighlightService] Highlight updated:', id);

      return {
        success: true,
        message: 'Highlight updated successfully',
        data: existingHighlights[highlightIndex],
      };
    } catch (error) {
      log.error('[HighlightService] Failed to update highlight:', error);
      return {
        success: false,
        message: 'Failed to update highlight',
      };
    }
  }

  /**
   * Update highlight's last accessed time
   */
  static async updateLastAccessed(id: string): Promise<void> {
    try {
      const existingHighlights = await highlights.getValue();
      const highlight = existingHighlights.find((h) => h.id === id);

      if (highlight) {
        highlight.lastAccessedAt = Date.now();
        await highlights.setValue(existingHighlights);
      }
    } catch (error) {
      log.error('[HighlightService] Failed to update last accessed:', error);
    }
  }

  /**
   * Clear all highlights (with optional filtering)
   */
  static async clearHighlights(
    options: HighlightQueryOptions = {},
  ): Promise<HighlightOperationResult> {
    try {
      if (Object.keys(options).length === 0) {
        // Clear all highlights
        await highlights.setValue([]);
        return {
          success: true,
          message: 'All highlights cleared',
        };
      } else {
        // Clear filtered highlights
        const allHighlights = await highlights.getValue();
        const highlightsToKeep = allHighlights.filter((highlight) => {
          if (options.url && highlight.url === options.url) return false;
          if (options.hostname && highlight.hostname === options.hostname)
            return false;
          if (
            options.tags &&
            options.tags.length > 0 &&
            highlight.tags &&
            highlight.tags.some((tag) => options.tags!.includes(tag))
          ) {
            return false;
          }
          return true;
        });

        await highlights.setValue(highlightsToKeep);
        return {
          success: true,
          message: 'Selected highlights cleared',
        };
      }
    } catch (error) {
      log.error('[HighlightService] Failed to clear highlights:', error);
      return {
        success: false,
        message: 'Failed to clear highlights',
      };
    }
  }
}
