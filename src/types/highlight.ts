/**
 * Types for highlight functionality
 */

/** Serializable range information for reconstructing highlights */
export interface SerializableRange {
  /** Start container xpath */
  startContainerXPath: string;
  /** End container xpath */
  endContainerXPath: string;
  /** Start offset within the start container */
  startOffset: number;
  /** End offset within the end container */
  endOffset: number;
  /** Selected text content */
  textContent: string;
}

/** Highlight data stored in browser storage */
export interface HighlightData {
  /** Unique identifier for the highlight */
  id: string;
  /** URL of the page where highlight was created */
  url: string;
  /** Page title when highlight was created */
  title: string;
  /** Hostname for quick filtering */
  hostname: string;
  /** Serializable range information */
  range: SerializableRange;
  /** When the highlight was created */
  createdAt: number;
  /** Last time the highlight was accessed/viewed */
  lastAccessedAt: number;
  /** User notes associated with this highlight */
  note?: string;
  /** Tags for organization */
  tags?: string[];
  /** Color of the highlight (for future customization) */
  color?: string;
}

/** Options for querying highlights */
export interface HighlightQueryOptions {
  /** Filter by URL (exact match) */
  url?: string;
  /** Filter by hostname */
  hostname?: string;
  /** Filter by tags */
  tags?: string[];
  /** Limit number of results */
  limit?: number;
  /** Sort order */
  sortBy?: 'createdAt' | 'lastAccessedAt';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/** Result of highlight operations */
export interface HighlightOperationResult {
  success: boolean;
  message?: string;
  data?: HighlightData | HighlightData[];
}
