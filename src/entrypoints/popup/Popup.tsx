import { browser } from 'wxt/browser';
import { useEffect, useState } from 'react';
import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { Settings, Search, RefreshCw, ExternalLink, Plus, BookOpen, PanelRight } from 'lucide-react';

import { LogseqBlock } from '@/components/LogseqBlock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { graphUrl } from '@/utils/logseq-url';

import { sendMessage } from '@/types/messaging';
import { openSidebar } from '@/utils/sidebar';
import log from '@/utils/logger';
import { clipErrorMessage } from '@/utils/clip-feedback';
import { QuickActions, type ClipAction } from './components/QuickActions';
import { SearchResults } from './components/SearchResults';

/** Pages the popup does not search: browser and extension pages. */
const isSearchablePage = (url: string | undefined): url is string =>
  !!url &&
  !['chrome://', 'about:', 'moz-extension://', 'chrome-extension://'].some((prefix) =>
    url.startsWith(prefix),
  );

export default function Popup() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logseqSearchResult, setLogseqSearchResult] = useState<LogseqSearchResult>();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<Browser.tabs.Tab | null>(null);
  // False until the page's content script says it has a selection; stays
  // false where it cannot run (browser pages, the PDF viewer, ...).
  const [canClipSelection, setCanClipSelection] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [clipError, setClipError] = useState<{ action: ClipAction; message: string } | null>(null);

  const mountOpenPageMethod = () => {
    const innerFunction = () => {
      if (isLoading) return;
      document.querySelectorAll('a').forEach((e) => {
        if (e.onclick === null) {
          e.onclick = (event) => {
            event.preventDefault();
            sendMessage('app:openPage', { url: e.href })
              .then(() => window.close());
          };
        }
        if (!isLoading) {
          clearInterval(interval);
        }
      });
    };
    const interval = setInterval(innerFunction, 50);
  };

  const searchPage = async (url: string | undefined) => {
    if (!url) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await sendMessage('logseq:urlSearch', {
        url,
        options: { fuzzy: true }
      });

      if (result.status !== 200) {
        setError(result.msg || 'Failed to search current page');
        return;
      }

      setLogseqSearchResult(result.response!);
      mountOpenPageMethod();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search current page');
    } finally {
      setIsLoading(false);
    }
  };

  // Uses state, so only call it from event handlers (not from the mount effect,
  // where currentTab has not been committed yet).
  const searchCurrentPage = () => searchPage(currentTab?.url);

  // Clearing the search box (typing it empty, its clear button, Escape) goes
  // back to the results for the current page.
  const changeSearchQuery = (query: string) => {
    setSearchQuery(query);
    if (query === '' && searchQuery !== '' && isSearchablePage(currentTab?.url)) {
      searchCurrentPage();
    }
  };

  const performSearch = async (query: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const result = await sendMessage('logseq:search', query);

      if (result.status !== 200) {
        setError(result.msg || 'Search failed');
        return;
      }

      setLogseqSearchResult(result.response!);
      mountOpenPageMethod();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchQuery);
  };

  const openSettingsPage = () => {
    sendMessage('app:openOptions');
    window.close();
  };

  const openLogseqGraph = () => {
    if (logseqSearchResult?.graph) {
      window.open(graphUrl(logseqSearchResult.graph), '_blank');
      window.close();
    }
  };

  // Closes the popup once clipped; a failure stays on the action.
  const runClip = async (action: ClipAction, clip: () => Promise<unknown>) => {
    setClipping(true);
    setClipError(null);
    try {
      await clip();
      window.close();
    } catch (err) {
      log.error('Failed to clip:', err);
      setClipError({ action, message: clipErrorMessage(err) });
    } finally {
      setClipping(false);
    }
  };

  const quickCapture = () => runClip('page', () => sendMessage('logseq:clipPage'));

  // The same command as the "Clip selection" context menu item. The popup shows
  // a failure itself, not the page.
  const tabId = currentTab?.id;
  const clipSelection = () => {
    if (tabId === undefined) return;
    return runClip('selection', () =>
      sendMessage('content:quickCaptureWithSelection', { feedback: 'sender' }, { tabId }),
    );
  };

  // The window is known from the tab query at mount, before the click: the
  // browser opens the sidebar only while the click is still a user action, so
  // nothing may be awaited before openSidebar.
  const windowId = currentTab?.windowId;
  const openSidebarAndClose = () => {
    if (windowId === undefined) return;
    openSidebar(windowId)
      .then(() => window.close())
      .catch((err) => log.error('Failed to open the highlights sidebar:', err));
  };

  useEffect(() => {
    const initializePopup = async () => {
      try {
        const queryOptions = { active: true, lastFocusedWindow: true };
        const [tab] = await browser.tabs.query(queryOptions);

        if (tab) {
          setCurrentTab(tab);
          if (tab.id !== undefined) {
            sendMessage('content:hasSelection', undefined, { tabId: tab.id }).then(
              (has) => setCanClipSelection(has === true),
              () => setCanClipSelection(false),
            );
          }
          if (isSearchablePage(tab.url)) {
            await searchPage(tab.url);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize popup');
      }
    };

    initializePopup();
  }, []);

  const handleRetry = () => {
    setError(null);
    searchCurrentPage();
  };

  return (
    <div className="w-96 max-h-[600px] p-4 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex shrink-0 items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-lg whitespace-nowrap">Logseq Copilot</h2>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          {logseqSearchResult?.graph && (
            <button
              type="button"
              onClick={openLogseqGraph}
              aria-label={`Open ${logseqSearchResult.graph} in Logseq`}
              title={`Open ${logseqSearchResult.graph} in Logseq`}
              className={cn(badgeVariants({ variant: 'secondary' }), 'mr-1 min-w-0 cursor-pointer')}
            >
              <span className="truncate">{logseqSearchResult.graph}</span>
            </button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={openSidebarAndClose}
            disabled={windowId === undefined}
            aria-label="Highlights"
            title="Highlights"
            className="h-8 w-8 shrink-0 p-0"
          >
            <PanelRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={openSettingsPage}
            aria-label="Settings"
            title="Settings"
            className="h-8 w-8 shrink-0 p-0"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search in your Logseq graph..."
            value={searchQuery}
            onChange={(e) => changeSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              // Escape in a popup closes it: with a query, clear that instead.
              if (e.key === 'Escape' && searchQuery !== '') {
                e.preventDefault();
                changeSearchQuery('');
              }
            }}
            className="pl-10"
            disabled={isSearching}
          />
          {isSearching && (
            <RefreshCw className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </form>

      {/* Current Page Info */}
      {currentTab && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate" title={currentTab.title}>
            {currentTab.title}
          </span>
        </div>
      )}

      {/* Quick Actions */}
      <QuickActions
        onQuickCapture={quickCapture}
        onClipSelection={clipSelection}
        canClipSelection={canClipSelection}
        clipping={clipping}
        // The same text in the search error box: the red border is enough.
        clipError={
          clipError && {
            action: clipError.action,
            message: clipError.message === error ? null : clipError.message,
          }
        }
      />

      {/* Content */}
      <div className="mt-3 overflow-y-auto max-h-[400px] border-t pt-3">
        <SearchResults
          searchResult={logseqSearchResult}
          isLoading={isLoading}
          error={error}
          onRetry={handleRetry}
          onQuickCapture={quickCapture}
          onOpenLogseq={openLogseqGraph}
          maxResults={10}
        />
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            <a
              href="https://github.com/eindex/logseq-copilot/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Feedback
            </a>
          </span>
          <span>
            Powered by{' '}
            <a
              href="https://logseq-copilot.eindex.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Logseq Copilot
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
