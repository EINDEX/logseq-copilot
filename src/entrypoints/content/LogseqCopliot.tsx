import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { LogseqResultList } from '@/components/LogseqResultList';
import { IconSettings, IconAlertCircle } from '@tabler/icons-react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';
import logo from '@/assets/img/logo.png';
import '@/assets/globals.css';
import '@/components/logseq-results.css';
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

type LoadingState = 'loading' | 'success' | 'error' | 'disconnected';

// Minimum delay between URL-change re-searches.
const RESEARCH_DEBOUNCE_MS = 500;

const LogseqCopliotContent = ({ query, hostFont }: LogseqCopliotProps) => {
  const [state, setState] = React.useState<LoadingState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const [logseqSearchResult, setLogseqSearchResult] = React.useState<LogseqSearchResult>();

  React.useEffect(() => {
    let lastSearchedUrl = '';
    let researchTimer: ReturnType<typeof setTimeout> | undefined;

    const performSearch = async () => {
      setState('loading');
      setErrorMessage('');

      try {
        // Search engine result pages: search by keyword only. A URL search
        // would recall every block that mentions the engine's own host. The
        // URL is still sent so the recall rules (page scope, keyword
        // filters) matching this page apply to the results.
        const currentUrl = window.location.href;
        lastSearchedUrl = currentUrl;

        const result = await sendMessage('logseq:hybridSearch', {
          url: currentUrl,
          query: query,
          keywordOnly: true,
        });

        if (result.msg === 'success') {
          setState('success');
          setLogseqSearchResult(result.response);
          setErrorMessage('');
        } else {
          setState('error');
          setErrorMessage(result.msg);
          setLogseqSearchResult(undefined);
        }
      } catch (err) {
        setState('error');
        setErrorMessage(err instanceof Error ? err.message : 'Search failed');
        setLogseqSearchResult(undefined);
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
      if (researchTimer) clearTimeout(researchTimer);
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [query]);

  const handleOpenOptions = () => {
    sendMessage('app:openOptions');
  };

  const graphUrl = logseqSearchResult?.graph
    ? `logseq://graph/${encodeURIComponent(logseqSearchResult.graph)}`
    : undefined;

  const blocks = logseqSearchResult?.blocks ?? [];
  const pages = (logseqSearchResult?.pages ?? []).filter(Boolean);
  const total = blocks.filter((block) => block.html).length;

  const header = (
    <div className="lc-header">
      <img className="lc-logo" src={logo} alt="" />
      <span className="lc-title">{logseqSearchResult?.graph || 'Logseq'}</span>
      {state === 'success' && total > 0 && (
        <span className="lc-count">
          {total} {total === 1 ? 'result' : 'results'}
        </span>
      )}
      <span className="lc-spacer" />
      <button
        type="button"
        className="lc-button lc-icon-button"
        title="Logseq Copilot settings"
        aria-label="Logseq Copilot settings"
        onClick={handleOpenOptions}
      >
        <IconSettings />
      </button>
    </div>
  );

  const loading = (
    <div className="lc-skeleton" aria-busy="true" aria-label="Searching Logseq">
      <span style={{ width: '40%' }} />
      <span style={{ width: '92%' }} />
      <span style={{ width: '76%' }} />
    </div>
  );

  const error = (
    <div className="lc-message" role="status">
      <IconAlertCircle className="lc-message-icon" />
      <span>
        {errorMessage || 'Unable to connect to Logseq.'}{' '}
        <button type="button" className="lc-inline-link" onClick={handleOpenOptions}>
          Check the connection
        </button>
      </span>
    </div>
  );

  const results =
    total === 0 && pages.length === 0 ? (
      <div className="lc-message">No notes found for this search.</div>
    ) : (
      <LogseqResultList graph={logseqSearchResult!.graph} blocks={blocks} pages={pages} />
    );

  const footer = (
    <div className="lc-footer">
      {graphUrl && (
        <>
          <a className="lc-link" href={graphUrl}>
            Open in Logseq
          </a>
          <span aria-hidden>·</span>
        </>
      )}
      <a
        className="lc-link"
        href="https://github.com/EINDEX/logseq-copilot/issues"
        target="_blank"
        rel="noopener noreferrer"
      >
        Feedback
      </a>
      <span className="lc-spacer" />
      <a
        className="lc-link"
        href="https://logseq-copilot.eindex.me/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Logseq Copilot
      </a>
    </div>
  );

  return (
    <section
      className="lc-results lc-sidebar"
      aria-label="Notes from Logseq"
      style={hostFont ? ({ '--lc-font': hostFont } as React.CSSProperties) : undefined}
    >
      {header}
      {state === 'loading' && loading}
      {state === 'error' && error}
      {state === 'success' && logseqSearchResult && results}
      {footer}
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
