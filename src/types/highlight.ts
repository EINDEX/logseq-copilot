/**
 * Types for highlight functionality
 */
import type { LogseqLink } from './annotation';

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

/** An image of the page, found again by its place in the page and its source. */
export interface SerializableImage {
  /** XPath of the <img> element. */
  xpath: string;
  /** The URL the image shows (`currentSrc`, else `src`), absolute. */
  src: string;
  /** Its alt text, '' without one. */
  alt: string;
}

/** What every stored highlight has, whatever it highlights. */
interface HighlightBase {
  /** Unique identifier for the highlight */
  id: string;
  /** URL of the page where highlight was created */
  url: string;
  /** Page title when highlight was created */
  title: string;
  /** Hostname for quick filtering */
  hostname: string;
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
  /** The clip this highlight was made with, in Logseq; absent on older ones. */
  logseq?: LogseqLink;
}

/** A highlight of text: every highlight stored before images could be. */
export interface TextHighlightData extends HighlightBase {
  /** Serializable range information */
  range: SerializableRange;
  image?: undefined;
}

/** A highlight of one image. */
export interface ImageHighlightData extends HighlightBase {
  image: SerializableImage;
  range?: undefined;
}

/** Highlight data stored in browser storage */
export type HighlightData = TextHighlightData | ImageHighlightData;

/**
 * The text a highlight stands for in lists and searches: the highlighted
 * text, or the alt text of the image.
 */
export const highlightText = (highlight: HighlightData): string =>
  highlight.image ? highlight.image.alt : highlight.range.textContent;

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
