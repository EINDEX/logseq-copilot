import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { LogseqBlock } from '@/components/LogseqBlock';
import { Button } from '@/components/ui/button';
import { BookOpen, ExternalLink, Plus, RefreshCw } from 'lucide-react';

interface SearchResultsProps {
    searchResult: LogseqSearchResult | undefined;
    isLoading: boolean;
    error: string | null;
    onRetry: () => void;
    onQuickCapture: () => void;
    onOpenLogseq: () => void;
    maxResults?: number;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
    searchResult,
    isLoading,
    error,
    onRetry,
    onQuickCapture,
    onOpenLogseq,
    maxResults = 10,
}) => {
    if (error) {
        return (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                    className="mt-3 w-full"
                >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Searching...</span>
            </div>
        );
    }

    if (!searchResult?.blocks?.length) {
        return (
            <div className="py-8 text-center">
                <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground mb-4">
                    No related content found in your Logseq graph
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onQuickCapture}
                    className="w-full"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Quick Capture
                </Button>
            </div>
        );
    }

    const displayedBlocks = searchResult.blocks.slice(0, maxResults);
    const hasMoreResults = searchResult.blocks.length > maxResults;

    return (
        <div className="space-y-2">
            {/* Results Header */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Results</span>
                <span>{searchResult.blocks.length}</span>
            </div>

            {/* Results List */}
            <div className="-mx-2 divide-y [&>*]:py-2">
                {displayedBlocks.map((block) => (
                    <LogseqBlock
                        key={block.uuid}
                        graph={searchResult.graph}
                        blocks={[block]}
                        isPopUp={true}
                    />
                ))}
            </div>

            {/* More Results */}
            {hasMoreResults && (
                <div className="border-t pt-2 text-center">
                    <p className="text-xs text-muted-foreground mb-1">
                        {searchResult.blocks.length - maxResults} more results available
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onOpenLogseq}
                        className="w-full"
                    >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in Logseq
                    </Button>
                </div>
            )}
        </div>
    );
}; 