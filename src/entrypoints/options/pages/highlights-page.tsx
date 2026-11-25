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
import { highlightText, type HighlightData, type HighlightQueryOptions } from '@/types/highlight';
import { HighlightImage } from '@/components/HighlightImage';
import log from '@/utils/logger';
import { intlLocale } from '@/i18n/language';
import { useTranslation } from '@/i18n/react';

export function HighlightsPage() {
    const { t, i18n } = useTranslation();
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
            text: highlightText(highlight),
            ...(highlight.image && { image: highlight.image.src }),
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
        if (!confirm(t('options.highlights.confirmClearAll'))) {
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
        return new Date(timestamp).toLocaleDateString(intlLocale(i18n.language), {
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
                highlightText(highlight).toLowerCase().includes(query) ||
                highlight.title.toLowerCase().includes(query) ||
                highlight.hostname.toLowerCase().includes(query) ||
                highlight.note?.toLowerCase().includes(query)
            );
        }
        return true;
    });

    return (
        <PageLayout
            title={t('options.highlights.title')}
            description={t('options.highlights.description')}
            meta={t('options.highlights.meta', {
                total: stats.total,
                websites: stats.websites,
                thisWeek: stats.thisWeek,
            })}
            actions={
                <>
                    <Button
                        onClick={handleExportAll}
                        variant="outline"
                        size="sm"
                        disabled={highlights.length === 0}
                    >
                        <IconDownload className="h-4 w-4 mr-2" />
                        {t('options.highlights.exportAll')}
                    </Button>
                    <Button
                        onClick={handleClearAll}
                        variant="outline"
                        size="sm"
                        disabled={highlights.length === 0}
                        className="text-destructive hover:text-destructive"
                    >
                        <IconTrash className="h-4 w-4 mr-2" />
                        {t('options.highlights.clearAll')}
                    </Button>
                </>
            }
        >
            <PageSection
                title={t('options.highlights.all')}
                description={t('options.highlights.count', {
                    shown: filteredHighlights.length,
                    total: highlights.length,
                })}
            >
                <div className="flex flex-wrap gap-2">
                    <div className="relative min-w-60 flex-1">
                        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={t('options.highlights.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Input
                        placeholder={t('options.highlights.filterPlaceholder')}
                        value={filterHostname}
                        onChange={(e) => setFilterHostname(e.target.value)}
                        className="w-60"
                    />
                    <Button onClick={handleSearch} variant="outline">
                        {t('options.highlights.applyFilters')}
                    </Button>
                </div>

                {allTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-sm text-muted-foreground">{t('options.highlights.tags')}</span>
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
                    <p className="py-12 text-center text-sm text-muted-foreground">{t('options.highlights.loading')}</p>
                ) : filteredHighlights.length === 0 ? (
                    <div className="py-12 text-center">
                        <IconHighlight className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
                        <div className="text-sm text-muted-foreground mb-1">
                            {highlights.length === 0
                                ? t('options.highlights.empty.none')
                                : t('options.highlights.empty.noMatch')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {highlights.length === 0
                                ? t('options.highlights.empty.noneHint')
                                : t('options.highlights.empty.noMatchHint')
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
                                        {highlight.image ? (
                                            <HighlightImage image={highlight.image} />
                                        ) : (
                                            truncateText(highlight.range.textContent)
                                        )}
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
                                    aria-label={t('options.highlights.delete')}
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