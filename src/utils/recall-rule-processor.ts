import { RecallRuleConfig, recallRulesConfig } from '@/utils/storage';
import { log } from '@/utils';

export interface ProcessedSearchContext {
  originalUrl: URL;
  processedUrl: URL;
  searchQueries: string[];
  excludeKeywords: string[];
  includeKeywords: string[];
  searchScope: {
    restrictToPages?: string[];
    excludePages?: string[];
    journalDateRange?: {
      enabled: boolean;
      days: number;
    };
  };
  resultFiltering: {
    maxResults?: number;
    minRelevanceScore?: number;
    prioritizeRecent: boolean;
  };
  appliedRules: RecallRuleConfig[];
}

/**
 * The page a result belongs to. Current services attach a page object; a bare
 * id (or an object without a name) is an unresolved reference.
 */
export type ResultPage =
  | string
  | number
  | { name?: string; originalName?: string; title?: string; id?: number }
  | undefined
  | null;

/** The page's display name, or undefined when it cannot be determined. */
export const pageNameOf = (page: ResultPage): string | undefined => {
  if (page === undefined || page === null || typeof page === 'number') {
    return undefined;
  }
  const name =
    typeof page === 'string'
      ? page
      : page.title || page.originalName || page.name;
  return name && name.trim() ? name : undefined;
};

const normalizePageName = (name: string) => name.trim().toLowerCase();

/**
 * Whether a page passes the restrictToPages / excludePages scope. Page names
 * are compared exactly after trimming and lower-casing (excluding "Work" does
 * not hide "Homework"). While a scope rule is active, a page whose name is
 * unknown is rejected (fail closed) so excluded content cannot slip through.
 */
export const pageInScope = (
  page: ResultPage,
  scope: ProcessedSearchContext['searchScope'],
): boolean => {
  const restrict = (scope.restrictToPages ?? [])
    .map(normalizePageName)
    .filter(Boolean);
  const exclude = (scope.excludePages ?? [])
    .map(normalizePageName)
    .filter(Boolean);
  if (restrict.length === 0 && exclude.length === 0) return true;

  const name = pageNameOf(page);
  if (name === undefined) return false;
  const normalized = normalizePageName(name);

  if (restrict.length > 0 && !restrict.includes(normalized)) return false;
  return !exclude.includes(normalized);
};

export class RecallRuleProcessor {
  private static instance: RecallRuleProcessor;
  private rules: RecallRuleConfig[] = [];

  private constructor() {}

  public static getInstance(): RecallRuleProcessor {
    if (!RecallRuleProcessor.instance) {
      RecallRuleProcessor.instance = new RecallRuleProcessor();
    }
    return RecallRuleProcessor.instance;
  }

  /**
   * Initialize the processor by loading rules from storage
   */
  public async initialize(): Promise<void> {
    try {
      this.rules = await recallRulesConfig.getValue();
      log.debug('[RecallRuleProcessor] Loaded rules:', this.rules);
    } catch (error) {
      log.error('[RecallRuleProcessor] Failed to load rules:', error);
      this.rules = [];
    }
  }

  /**
   * Get rules that match a given URL
   */
  public getMatchingRules(url: string): RecallRuleConfig[] {
    return this.rules
      .filter((rule) => {
        if (!rule.enabled) return false;

        try {
          const regex = new RegExp(rule.urlPattern, 'i');
          return regex.test(url);
        } catch (error) {
          log.warn(
            `[RecallRuleProcessor] Invalid URL pattern for rule ${rule.name}:`,
            error,
          );
          return false;
        }
      })
      .sort((a, b) => {
        // More specific patterns (longer) should have higher priority
        return b.urlPattern.length - a.urlPattern.length;
      });
  }

  /**
   * Process URL according to matching recall rules
   */
  public processUrl(originalUrl: URL, rules: RecallRuleConfig[]): URL {
    const processedUrl = new URL(originalUrl.href);

    // Apply all applicable rules
    for (const rule of rules) {
      // Remove hash fragments if specified
      if (rule.queryProcessing.ignoreHashFragments) {
        processedUrl.hash = '';
      }

      // Remove query parameters if specified
      if (rule.queryProcessing.ignoreQueryParams) {
        processedUrl.search = '';
      }

      // Remove specified path segments
      if (rule.queryProcessing.ignorePathSegments.length > 0) {
        const pathSegments = processedUrl.pathname
          .split('/')
          .filter((segment) => segment);
        const filteredSegments = pathSegments.filter(
          (segment) =>
            !rule.queryProcessing.ignorePathSegments.includes(segment),
        );
        processedUrl.pathname = '/' + filteredSegments.join('/');
      }
    }

    return processedUrl;
  }

  /**
   * Generate search queries based on URL and rules
   */
  public generateSearchQueries(
    processedUrl: URL,
    rules: RecallRuleConfig[],
  ): string[] {
    const queries: string[] = [];

    // Base queries
    if (processedUrl.pathname && processedUrl.pathname !== '/') {
      queries.push(processedUrl.host + processedUrl.pathname);
    }

    if (processedUrl.host) {
      queries.push(processedUrl.host);
    }

    // Apply include keywords to generate enhanced queries
    for (const rule of rules) {
      if (rule.queryProcessing.includeKeywords.length > 0) {
        const baseQuery = processedUrl.host + processedUrl.pathname;
        for (const keyword of rule.queryProcessing.includeKeywords) {
          queries.push(`${baseQuery} ${keyword}`);
          queries.push(`${processedUrl.host} ${keyword}`);
        }
      }
    }

    // Remove duplicates and return
    return [...new Set(queries)];
  }

  /**
   * Combine search scope restrictions from all applicable rules
   */
  public combineSearchScope(
    rules: RecallRuleConfig[],
  ): ProcessedSearchContext['searchScope'] {
    const combinedScope: ProcessedSearchContext['searchScope'] = {};

    // Combine restrict to pages (intersection - more restrictive)
    const restrictToPages = rules
      .map((rule) => rule.searchScope.restrictToPages)
      .filter((pages) => pages && pages.length > 0);

    if (restrictToPages.length > 0) {
      // Take intersection of all restrict lists
      combinedScope.restrictToPages = restrictToPages.reduce((acc, pages) => {
        if (!acc) return pages;
        return acc.filter((page) => pages!.includes(page));
      });
    }

    // Combine exclude pages (union - more restrictive)
    const allExcludePages = rules
      .flatMap((rule) => rule.searchScope.excludePages ?? []);

    if (allExcludePages.length > 0) {
      combinedScope.excludePages = [...new Set(allExcludePages)];
    }

    // Journal date range (take the most restrictive)
    const journalRanges = rules
      .map((rule) => rule.searchScope.journalDateRange)
      .filter((range) => range && range.enabled);

    if (journalRanges.length > 0) {
      const minDays = Math.min(...journalRanges.map((range) => range!.days));
      combinedScope.journalDateRange = {
        enabled: true,
        days: minDays,
      };
    }

    return combinedScope;
  }

  /**
   * Combine result filtering from all applicable rules
   */
  public combineResultFiltering(
    rules: RecallRuleConfig[],
  ): ProcessedSearchContext['resultFiltering'] {
    const combinedFiltering: ProcessedSearchContext['resultFiltering'] = {
      prioritizeRecent: false,
    };

    // Max results (take the smallest)
    const maxResults = rules
      .map((rule) => rule.resultFiltering.maxResults)
      .filter((max) => max !== undefined);

    if (maxResults.length > 0) {
      combinedFiltering.maxResults = Math.min(...maxResults);
    }

    // Min relevance score (take the highest)
    const minScores = rules
      .map((rule) => rule.resultFiltering.minRelevanceScore)
      .filter((score) => score !== undefined);

    if (minScores.length > 0) {
      combinedFiltering.minRelevanceScore = Math.max(...minScores);
    }

    // Prioritize recent (OR operation - any rule that enables it)
    combinedFiltering.prioritizeRecent = rules.some(
      (rule) => rule.resultFiltering.prioritizeRecent,
    );

    return combinedFiltering;
  }

  /**
   * Process a URL and return complete search context
   */
  public async processSearchContext(
    url: string,
  ): Promise<ProcessedSearchContext> {
    // Re-read the rules on every search: they are edited on the options page
    // while this (background) instance stays alive, and storage is cheap.
    await this.initialize();

    const originalUrl = new URL(url);
    const matchingRules = this.getMatchingRules(url);

    log.debug('[RecallRuleProcessor] Processing URL:', url);
    log.debug(
      '[RecallRuleProcessor] Matching rules:',
      matchingRules.map((r) => r.name),
    );

    const processedUrl = this.processUrl(originalUrl, matchingRules);
    const searchQueries = this.generateSearchQueries(
      processedUrl,
      matchingRules,
    );

    // Combine keywords from all rules
    const excludeKeywords = [
      ...new Set(
        matchingRules.flatMap((rule) => rule.queryProcessing.excludeKeywords),
      ),
    ];

    const includeKeywords = [
      ...new Set(
        matchingRules.flatMap((rule) => rule.queryProcessing.includeKeywords),
      ),
    ];

    const searchScope = this.combineSearchScope(matchingRules);
    const resultFiltering = this.combineResultFiltering(matchingRules);

    const context: ProcessedSearchContext = {
      originalUrl,
      processedUrl,
      searchQueries,
      excludeKeywords,
      includeKeywords,
      searchScope,
      resultFiltering,
      appliedRules: matchingRules,
    };

    log.debug('[RecallRuleProcessor] Generated search context:', context);

    return context;
  }

  /**
   * Filter page results by the restrictToPages / excludePages scope (exact,
   * case-insensitive names; unknown names are dropped while a scope is active).
   */
  public filterPages<T extends Exclude<ResultPage, string | number | null | undefined>>(
    pages: T[],
    context: ProcessedSearchContext,
  ): T[] {
    return pages.filter((page) => pageInScope(page, context.searchScope));
  }

  /**
   * Filter search results based on recall rules
   */
  public filterResults<
    T extends { content?: string; page?: ResultPage; createdAt?: Date },
  >(results: T[], context: ProcessedSearchContext): T[] {
    let filteredResults = [...results];

    // Filter by exclude keywords
    if (context.excludeKeywords.length > 0) {
      filteredResults = filteredResults.filter((result) => {
        const content = (result.content || '').toLowerCase();
        return !context.excludeKeywords.some((keyword) =>
          content.includes(keyword.toLowerCase()),
        );
      });
    }

    // Filter by page restrictions / exclusions (exact names, fail closed)
    filteredResults = filteredResults.filter((result) =>
      pageInScope(result.page, context.searchScope),
    );

    // Sort by priority (include keywords first)
    if (context.includeKeywords.length > 0) {
      filteredResults.sort((a, b) => {
        const aContent = (a.content || '').toLowerCase();
        const bContent = (b.content || '').toLowerCase();

        const aScore = context.includeKeywords.reduce((score, keyword) => {
          return score + (aContent.includes(keyword.toLowerCase()) ? 1 : 0);
        }, 0);

        const bScore = context.includeKeywords.reduce((score, keyword) => {
          return score + (bContent.includes(keyword.toLowerCase()) ? 1 : 0);
        }, 0);

        return bScore - aScore; // Higher score first
      });
    }

    // Sort by recency if requested
    if (
      context.resultFiltering.prioritizeRecent &&
      filteredResults[0]?.createdAt
    ) {
      filteredResults.sort((a, b) => {
        const aTime = a.createdAt?.getTime() || 0;
        const bTime = b.createdAt?.getTime() || 0;
        return bTime - aTime; // Newer first
      });
    }

    // Limit results
    if (context.resultFiltering.maxResults) {
      filteredResults = filteredResults.slice(
        0,
        context.resultFiltering.maxResults,
      );
    }

    log.debug('[RecallRuleProcessor] Filtered results:', {
      original: results.length,
      filtered: filteredResults.length,
      rules: context.appliedRules.map((r) => r.name),
    });

    return filteredResults;
  }

}
