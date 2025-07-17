import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    IconHighlight,
    IconSearch,
    IconFilter,
    IconDownload,
    IconTrash,
    IconCalendar,
    IconGlobe
} from '@tabler/icons-react';
import { HighlightService } from '@/utils/highlight-service';
import type { HighlightData, HighlightQueryOptions } from '@/types/highlight';

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
            console.error('Failed to load highlights:', error);
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
            console.error('Failed to delete highlight:', error);
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
            console.error('Failed to clear highlights:', error);
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
        <div className="space-y-6">
            {/* Header with stats */}
            <div>
                <h1 className="text-2xl font-semibold mb-2">Highlight Management</h1>
                <p className="text-muted-foreground mb-4">
                    Manage all your saved highlights across different websites
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-xs text-muted-foreground">Total Highlights</p>
                            </div>
                            <IconHighlight className="h-8 w-8 text-muted-foreground" />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="text-2xl font-bold">{stats.websites}</p>
                                <p className="text-xs text-muted-foreground">Websites</p>
                            </div>
                            <IconGlobe className="h-8 w-8 text-muted-foreground" />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="text-2xl font-bold">{stats.thisWeek}</p>
                                <p className="text-xs text-muted-foreground">This Week</p>
                            </div>
                            <IconCalendar className="h-8 w-8 text-muted-foreground" />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Search and Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <IconFilter className="h-4 w-4" />
                        Search & Filter
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
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
                        <div>
                            <p className="text-sm font-medium mb-2">Tags:</p>
                            <div className="flex flex-wrap gap-2">
                                {allTags.map(tag => (
                                    <Badge
                                        key={tag}
                                        variant={selectedTags.includes(tag) ? "default" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => toggleTag(tag)}
                                    >
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">
                    {filteredHighlights.length} of {highlights.length} highlights
                </div>

                <div className="flex gap-2">
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
                </div>
            </div>

            {/* Highlights List */}
            <Card>
                <CardHeader>
                    <CardTitle>All Highlights</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">
                            <div className="text-sm text-muted-foreground">Loading highlights...</div>
                        </div>
                    ) : filteredHighlights.length === 0 ? (
                        <div className="text-center py-8">
                            <IconHighlight className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <div className="text-sm text-muted-foreground mb-2">
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
                        <div className="space-y-4">
                            {filteredHighlights.map((highlight, index) => (
                                <div key={highlight.id} className="space-y-2">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <a
                                                    href={highlight.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-medium text-primary hover:underline"
                                                >
                                                    {highlight.title}
                                                </a>
                                                <Badge variant="outline" className="text-xs">
                                                    {highlight.hostname}
                                                </Badge>
                                            </div>

                                            <div className="text-sm text-foreground bg-muted/50 p-3 rounded border-l-4 border-primary/50 mb-2">
                                                "{truncateText(highlight.range.textContent)}"
                                            </div>

                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                                <span>{formatDate(highlight.createdAt)}</span>
                                                {highlight.color && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="h-4 px-1.5 py-0"
                                                    >
                                                        {highlight.color}
                                                    </Badge>
                                                )}
                                                {highlight.tags && highlight.tags.length > 0 && (
                                                    <div className="flex gap-1">
                                                        {highlight.tags.map(tag => (
                                                            <Badge key={tag} variant="outline" className="h-4 px-1.5 py-0">
                                                                {tag}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {highlight.note && (
                                                <div className="text-xs text-muted-foreground italic">
                                                    Note: {highlight.note}
                                                </div>
                                            )}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteHighlight(highlight.id)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <IconTrash className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    {index < filteredHighlights.length - 1 && <Separator />}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
} 