import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { LogseqBlock } from '@/components/LogseqBlock';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
            <Card className="border-destructive">
                <CardContent className="pt-6">
                    <div className="flex items-center gap-2 text-destructive">
                        <span className="text-sm">{error}</span>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="mt-3 w-full"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (isLoading) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Searching...</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!searchResult?.blocks?.length) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="text-center py-8">
                        <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
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
                </CardContent>
            </Card>
        );
    }

    const displayedBlocks = searchResult.blocks.slice(0, maxResults);
    const hasMoreResults = searchResult.blocks.length > maxResults;

    return (
        <div className="space-y-3">
            {/* Results Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Results</span>
                    <Badge variant="secondary" className="text-xs">
                        {searchResult.blocks.length}
                    </Badge>
                </div>
                {searchResult.graph && (
                    <Badge variant="outline" className="text-xs">
                        {searchResult.graph}
                    </Badge>
                )}
            </div>

            {/* Results List */}
            <div className="space-y-2">
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
                <Card className="border-dashed">
                    <CardContent className="pt-4">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-2">
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
                    </CardContent>
                </Card>
            )}
        </div>
    );
}; 