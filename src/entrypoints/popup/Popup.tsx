import { browser } from 'wxt/browser';
import { useEffect, useState } from 'react';
import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { Settings, Search, RefreshCw, ExternalLink, Plus, BookOpen } from 'lucide-react';

import { LogseqBlock } from '@/components/LogseqBlock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

import { sendMessage } from '@/types/messaging';
import { QuickActions } from './components/QuickActions';
import { SearchResults } from './components/SearchResults';

export default function Popup() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logseqSearchResult, setLogseqSearchResult] = useState<LogseqSearchResult>();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);

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

  const searchCurrentPage = async () => {
    if (!currentTab?.url) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await sendMessage('logseq:urlSearch', {
        url: currentTab.url,
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
      window.open(`logseq://graph/${logseqSearchResult.graph}`, '_blank');
      window.close();
    }
  };

  const quickCapture = () => {
    sendMessage('logseq:clipPage');
    window.close();
  };

  useEffect(() => {
    const initializePopup = async () => {
      try {
        const queryOptions = { active: true, lastFocusedWindow: true };
        const [tab] = await browser.tabs.query(queryOptions);

        if (tab) {
          setCurrentTab(tab);
          if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('moz-extension://')) {
            await searchCurrentPage();
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-lg">Logseq Copilot</h2>
        </div>
        <div className="flex items-center gap-1">
          {logseqSearchResult?.graph && (
            <Badge variant="secondary" className="text-xs">
              {logseqSearchResult.graph}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={openSettingsPage}
            className="h-8 w-8 p-0"
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
            type="text"
            placeholder="Search in your Logseq graph..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate" title={currentTab.title}>
              {currentTab.title}
            </span>
          </div>
          <Separator className="mt-2" />
        </div>
      )}

      {/* Quick Actions */}
      <QuickActions
        onQuickCapture={quickCapture}
        onRefresh={searchCurrentPage}
        onOpenSettings={openSettingsPage}
        onOpenLogseq={openLogseqGraph}
        isLoading={isLoading}
        hasGraph={!!logseqSearchResult?.graph}
      />

      {/* Content */}
      <div className="overflow-y-auto max-h-[400px]">
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
