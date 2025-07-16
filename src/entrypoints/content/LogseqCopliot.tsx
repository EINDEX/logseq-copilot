import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { LogseqResponseType } from '@/entrypoints/background/logseq/client';
import LogseqCopilot from '@/components/LogseqCopilot';
import { browser } from 'wxt/browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { IconSettings, IconAlertCircle, IconExternalLink } from '@tabler/icons-react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { sendMessage, onMessage } from '@/types/messaging';
import '@/assets/globals.css';

// Import theme test function for debugging
if (import.meta.env.DEV) {
  import('@/utils/theme-test').then(({ testThemeDetection }) => {
    (window as any).testLogseqTheme = testThemeDetection;
    console.log('Theme detection test function available: testLogseqTheme()');
  });
}

type LogseqCopliotProps = {
  query: string;
};

type LoadingState = 'loading' | 'success' | 'error' | 'disconnected';

const LogseqCopliotContent = ({ query }: LogseqCopliotProps) => {
  const [state, setState] = React.useState<LoadingState>('loading');
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const [logseqSearchResult, setLogseqSearchResult] = React.useState<LogseqSearchResult>();

  React.useEffect(() => {
    const performSearch = async () => {
      setState('loading');
      setErrorMessage('');

      try {
        const result = await sendMessage('logseq:search', query);

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
  }, [query]);

  const handleOpenOptions = () => {
    sendMessage('app:openOptions');
  };

  const handleOpenLogseq = () => {
    if (logseqSearchResult?.graph) {
      window.open(`logseq://graph/${logseqSearchResult.graph}`, '_blank');
    }
  };

  const renderLoadingState = () => (
    <Card className="w-full max-w-sm bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4 rounded" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );

  const renderErrorState = () => (
    <Card className="w-full max-w-sm border-destructive/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-card-foreground">
            <IconAlertCircle className="h-4 w-4 text-destructive" />
            Connection Issue
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenOptions}
            className="h-6 w-6 p-0"
          >
            <IconSettings className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {errorMessage || 'Unable to connect to Logseq. Please check your configuration.'}
        </p>
        <Button
          onClick={handleOpenOptions}
          variant="outline"
          size="sm"
          className="w-full"
        >
          Configure Connection
        </Button>
      </CardContent>
    </Card>
  );

  const renderSuccessState = () => {
    if (!logseqSearchResult) return null;

    const { graph, blocks, pages } = logseqSearchResult;
    const totalResults = blocks.length + pages.length;

    if (totalResults === 0) {
      return (
        <Card className="w-full max-w-sm bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-card-foreground">
                  {graph}
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  Connected
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenOptions}
                className="h-6 w-6 p-0"
              >
                <IconSettings className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">
                No results found for this search.
              </p>
              <Button
                onClick={handleOpenLogseq}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <IconExternalLink className="h-4 w-4" />
                Open Logseq
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="w-full max-w-sm bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium text-card-foreground">
                {graph}
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {totalResults} results
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenOptions}
              className="h-6 w-6 p-0"
            >
              <IconSettings className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <LogseqCopilot
            graph={graph}
            blocks={blocks}
            pages={pages}
          />
        </CardContent>
      </Card>
    );
  };

  const renderFooter = () => (
    <div className="flex justify-between items-center text-xs text-muted-foreground mt-3 px-1">
      <a
        href="https://github.com/EINDEX/logseq-copilot/issues"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground transition-colors"
      >
        Feedback
      </a>
      <span>
        powered by{' '}
        <a
          href="https://logseq-copilot.eindex.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Logseq Copilot
        </a>
      </span>
    </div>
  );

  return (
    <div className="flex flex-col w-full max-w-sm gap-2 pb-4">
      {state === 'loading' && renderLoadingState()}
      {state === 'error' && renderErrorState()}
      {state === 'success' && renderSuccessState()}
      {renderFooter()}
    </div>
  );
};

export const LogseqCopliot = ({ query }: LogseqCopliotProps) => {
  return (
    <ThemeProvider>
      <LogseqCopliotContent query={query} />
    </ThemeProvider>
  );
};
