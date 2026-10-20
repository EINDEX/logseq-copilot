import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    IconHighlight,
    IconSearch,
    IconDownload,
    IconTrash,
} from '@tabler/icons-react';
import { PageLayout, PageList, PageListRow, PageSection } from '../components/page-layout';
import { HighlightService } from '@/utils/highlight-service';
import type { HighlightData, HighlightQueryOptions } from '@/types/highlight';
import log from '@/utils/logger';

export function HighlightsPage() {
    const [highlights, setHighlights] = useState<HighlightData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterHostname, setFilterHostname] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [allTags, setAllTags] = useState<string[]>([]);
    const [stats, setStats] = useState({
        total: 0,
        websites: 0,
        thisWeek: 0,
    });

    const loadHighlights = async (options: HighlightQueryOptions = {}) => {
        try {
            setLoading(true);
            const allHighlights = await HighlightService.getHighlights(options);
            setHighlights(allHighlights);

            // Calculate stats
            const uniqueHostnames = new Set(allHighlights.map(h => h.hostname));
            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const recentHighlights = allHighlights.filter(h => h.createdAt > oneWeekAgo);

            setStats({
                total: allHighlights.length,
                websites: uniqueHostnames.size,
                thisWeek: recentHighlights.length,
            });

            // Extract all unique tags
            const tags = new Set<string>();
            allHighlights.forEach(highlight => {
                highlight.tags?.forEach(tag => tags.add(tag));
            });
            setAllTags(Array.from(tags).sort());

        } catch (error) {
            log.error('Failed to load highlights:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHighlights();
    }, []);

    const handleSearch = () => {
        const options: HighlightQueryOptions = {};

        if (filterHostname) {
            options.hostname = filterHostname;
        }

        if (selectedTags.length > 0) {
            options.tags = selectedTags;
        }

        loadHighlights(options);
    };

    const handleDeleteHighlight = async (highlightId: string) => {
        try {
            const result = await HighlightService.deleteHighlight(highlightId);
            if (result.success) {
                setHighlights(prev => prev.filter(h => h.id !== highlightId));
            }
        } catch (error) {
            log.error('Failed to delete highlight:', error);
        }
    };

    const handleExportAll = () => {
        const exportData = highlights.map(highlight => ({
            id: highlight.id,
            url: highlight.url,
            title: highlight.title,
            hostname: highlight.hostname,
            text: highlight.range.textContent,
            note: highlight.note,
            tags: highlight.tags,
            color: highlight.color,
            createdAt: new Date(highlight.createdAt).toISOString(),
            lastAccessedAt: new Date(highlight.lastAccessedAt).toISOString(),
        }));

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logseq-copilot-highlights-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleClearAll = async () => {
        if (!confirm('Are you sure you want to delete ALL highlights? This action cannot be undone.')) {
            return;
        }

        try {
            const result = await HighlightService.clearHighlights();
            if (result.success) {
                setHighlights([]);
                setStats({ total: 0, websites: 0, thisWeek: 0 });
            }
        } catch (error) {
            log.error('Failed to clear highlights:', error);
        }
    };

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const truncateText = (text: string, maxLength: number = 200) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    const filteredHighlights = highlights.filter(highlight => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                highlight.range.textContent.toLowerCase().includes(query) ||
                highlight.title.toLowerCase().includes(query) ||
                highlight.hostname.toLowerCase().includes(query) ||
                highlight.note?.toLowerCase().includes(query)
            );
        }
        return true;
    });

    return (
        <PageLayout
            title="Highlight Management"
            description="Manage all your saved highlights across different websites"
            meta={`${stats.total} highlights · ${stats.websites} websites · ${stats.thisWeek} this week`}
            actions={
                <>
                    <Button
                        onClick={handleExportAll}
                        variant="outline"
                        size="sm"
                        disabled={highlights.length === 0}
                    >
                        <IconDownload className="h-4 w-4 mr-2" />
                        Export All
                    </Button>
                    <Button
                        onClick={handleClearAll}
                        variant="outline"
                        size="sm"
                        disabled={highlights.length === 0}
                        className="text-destructive hover:text-destructive"
                    >
                        <IconTrash className="h-4 w-4 mr-2" />
                        Clear All
                    </Button>
                </>
            }
        >
            <PageSection
                title="All Highlights"
                description={`${filteredHighlights.length} of ${highlights.length} highlights`}
            >
                <div className="flex flex-wrap gap-2">
                    <div className="relative min-w-60 flex-1">
                        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search highlights..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Input
                        placeholder="Filter by website..."
                        value={filterHostname}
                        onChange={(e) => setFilterHostname(e.target.value)}
                        className="w-60"
                    />
                    <Button onClick={handleSearch} variant="outline">
                        Apply Filters
                    </Button>
                </div>

                {allTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-sm text-muted-foreground">Tags</span>
                        {allTags.map(tag => (
                            <Badge
                                key={tag}
                                variant={selectedTags.includes(tag) ? "default" : "outline"}
                                className="cursor-pointer font-normal"
                                onClick={() => toggleTag(tag)}
                            >
                                {tag}
                            </Badge>
                        ))}
                    </div>
                )}

                {loading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">Loading highlights...</p>
                ) : filteredHighlights.length === 0 ? (
                    <div className="py-12 text-center">
                        <IconHighlight className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
                        <div className="text-sm text-muted-foreground mb-1">
                            {highlights.length === 0 ? 'No highlights found' : 'No highlights match your search'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {highlights.length === 0
                                ? 'Start highlighting text on websites to see them here'
                                : 'Try adjusting your search or filters'
                            }
                        </div>
                    </div>
                ) : (
                    <PageList>
                        {filteredHighlights.map((highlight) => (
                            <PageListRow key={highlight.id} className="group flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <a
                                            href={highlight.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium text-primary hover:underline"
                                        >
                                            {highlight.title}
                                        </a>
                                        <span className="text-xs text-muted-foreground">{highlight.hostname}</span>
                                    </div>

                                    <blockquote className="border-l-2 border-highlight pl-3 text-sm text-foreground">
                                        {truncateText(highlight.range.textContent)}
                                    </blockquote>

                                    {highlight.note && (
                                        <p className="text-sm text-muted-foreground">{highlight.note}</p>
                                    )}

                                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                        <span className="mr-1">{formatDate(highlight.createdAt)}</span>
                                        {highlight.tags?.map(tag => (
                                            <Badge key={tag} variant="secondary" className="px-1.5 py-0 font-normal">
                                                {tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteHighlight(highlight.id)}
                                    className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                                    aria-label="Delete highlight"
                                >
                                    <IconTrash className="h-4 w-4" />
                                </Button>
                            </PageListRow>
                        ))}
                    </PageList>
                )}
            </PageSection>
        </PageLayout>
    );
} 