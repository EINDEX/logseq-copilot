import React from 'react';
import { browser } from 'wxt/browser';
import { RecallCard } from '@/components/recall/RecallCard';
import { ThemeProvider } from '@/components/ThemeProvider';
import { sendMessage } from '@/types/messaging';
import type { RecallResult } from '@/types/recall';
import { requestRecall } from '@/utils/recall-client';
import { normalizeQuery } from '@/utils/recall-query';
import log from '@/utils/logger';
import '@/assets/globals.css';
import './sidebar.css';

// Import theme test function for debugging
if (import.meta.env.DEV) {
  import('@/utils/theme-test').then(({ testThemeDetection }) => {
    (window as any).testLogseqTheme = testThemeDetection;
    log.debug('Theme detection test function available: testLogseqTheme()');
  });
}

type LogseqCopliotProps = {
  query: string;
  /** Font family of the element the sidebar is mounted in (host page). */
  hostFont?: string;
};

type LoadingState = 'loading' | 'success' | 'error';

// Minimum delay between URL-change re-searches.
const RESEARCH_DEBOUNCE_MS = 500;

/** Language of the browser UI, for relative times. */
const uiLocale = (): string | undefined => {
  try {
    return browser.i18n.getUILanguage() || navigator.language;
  } catch {
    return navigator.language;
  }
};

const LogseqCopliotContent = ({ query, hostFont }: LogseqCopliotProps) => {
  const [state, setState] = React.useState<LoadingState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const [result, setResult] = React.useState<RecallResult>();
  // Bumped on every search, so a new answer starts collapsed.
  const [generation, setGeneration] = React.useState(0);
  const terms = React.useMemo(() => normalizeQuery(query).terms, [query]);
  const locale = React.useMemo(uiLocale, []);

  React.useEffect(() => {
    let lastSearchedUrl = '';
    let researchTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    const performSearch = async () => {
      setState('loading');
      setErrorMessage('');
      // The URL selects the recall rules (keyword filters, page scope) that
      // apply to this result page.
      const currentUrl = window.location.href;
      lastSearchedUrl = currentUrl;

      try {
        const recall = await requestRecall(query, currentUrl);
        if (!active || lastSearchedUrl !== currentUrl) return;
        setResult(recall);
        setGeneration((n) => n + 1);
        setState('success');
      } catch (err) {
        if (!active || lastSearchedUrl !== currentUrl) return;
        setResult(undefined);
        setErrorMessage(err instanceof Error ? err.message : 'Search failed');
        setState('error');
      }
    };

    performSearch();

    // Re-search when URL changes (for SPAs and hash routing). Ignore
    // synthetic events from page scripts, skip unchanged URLs and debounce so
    // the page cannot drive a burst of Logseq searches.
    const handleLocationChange = (event: Event) => {
      if (!event.isTrusted) return;
      if (researchTimer) clearTimeout(researchTimer);
      researchTimer = setTimeout(() => {
        researchTimer = undefined;
        if (window.location.href === lastSearchedUrl) return;
        performSearch();
      }, RESEARCH_DEBOUNCE_MS);
    };

    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', handleLocationChange);

    // Listen for hash changes
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      active = false;
      if (researchTimer) clearTimeout(researchTimer);
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [query]);

  const handleOpenOptions = () => {
    sendMessage('app:openOptions');
  };

  return (
    <section
      className="lc-sidebar"
      aria-label="Notes from Logseq"
      style={hostFont ? ({ '--lc-font': hostFont } as React.CSSProperties) : undefined}
    >
      <RecallCard
        key={generation}
        state={state}
        result={result}
        terms={terms}
        error={errorMessage}
        onOpenOptions={handleOpenOptions}
        locale={locale}
      />
    </section>
  );
};

export const LogseqCopliot = ({ query, hostFont }: LogseqCopliotProps) => {
  return (
    <ThemeProvider>
      <LogseqCopliotContent query={query} hostFont={hostFont} />
    </ThemeProvider>
  );
};
