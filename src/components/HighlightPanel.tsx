import React, { useState, useEffect } from 'react';
import { HighlightManager } from '@/utils/highlight-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
    IconTrash,
    IconEye,
    IconEyeOff,
    IconHighlight,
    IconClearAll,
    IconDownload
} from '@tabler/icons-react';
import type { HighlightData } from '@/types/highlight';

interface HighlightPanelProps {
    className?: string;
}

export function HighlightPanel({ className }: HighlightPanelProps) {
    const [highlights, setHighlights] = useState<HighlightData[]>([]);
    const [loading, setLoading] = useState(true);
    const [hiddenHighlights, setHiddenHighlights] = useState<Set<string>>(new Set());

    const loadHighlights = async () => {
        try {
            setLoading(true);
            const highlightManager = HighlightManager.getInstance();
            const pageHighlights = await highlightManager.getPageHighlights();
            setHighlights(pageHighlights);
        } catch (error) {
            console.error('Failed to load highlights:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadHighlights();
    }, []);

    const handleDeleteHighlight = async (highlightId: string) => {
        try {
            const highlightManager = HighlightManager.getInstance();
            const success = await highlightManager.removeHighlight(highlightId);

            if (success) {
                setHighlights(prev => prev.filter(h => h.id !== highlightId));
            }
        } catch (error) {
            console.error('Failed to delete highlight:', error);
        }
    };

    const handleToggleVisibility = async (highlightId: string) => {
        const isHidden = hiddenHighlights.has(highlightId);

        if (isHidden) {
            // Show highlight
            setHiddenHighlights(prev => {
                const newSet = new Set(prev);
                newSet.delete(highlightId);
                return newSet;
            });

            // Re-display the highlight
            const highlight = highlights.find(h => h.id === highlightId);
            if (highlight) {
                const highlightManager = HighlightManager.getInstance();
                await highlightManager.displayHighlight(highlight);
            }
        } else {
            // Hide highlight
            setHiddenHighlights(prev => new Set(prev).add(highlightId));

            // Remove from display
            const highlightManager = HighlightManager.getInstance();
            await highlightManager.removeHighlight(highlightId);

            // Re-add to storage (since removeHighlight also removes from storage)
            // We need a method to just hide, not delete
            // For now, we'll keep track in state
        }
    };

    const handleClearAll = async () => {
        if (!confirm('Are you sure you want to delete all highlights on this page?')) {
            return;
        }

        try {
            const highlightManager = HighlightManager.getInstance();
            const success = await highlightManager.clearPageHighlights();

            if (success) {
                setHighlights([]);
                setHiddenHighlights(new Set());
            }
        } catch (error) {
            console.error('Failed to clear highlights:', error);
        }
    };

    const handleExportHighlights = () => {
        const exportData = highlights.map(highlight => ({
            id: highlight.id,
            url: highlight.url,
            title: highlight.title,
            text: highlight.range.textContent,
            note: highlight.note,
            tags: highlight.tags,
            createdAt: new Date(highlight.createdAt).toISOString(),
        }));

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `highlights-${window.location.hostname}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const truncateText = (text: string, maxLength: number = 100) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    if (loading) {
        return (
            <Card className={className}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <IconHighlight className="h-4 w-4" />
                        Highlights
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-sm text-muted-foreground">Loading highlights...</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={className}>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <IconHighlight className="h-4 w-4" />
                        Highlights ({highlights.length})
                    </CardTitle>

                    {highlights.length > 0 && (
                        <div className="flex gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleExportHighlights}
                                className="h-8 w-8 p-0"
                                title="Export highlights"
                            >
                                <IconDownload className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearAll}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                title="Clear all highlights"
                            >
                                <IconClearAll className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </CardHeader>

            <CardContent>
                {highlights.length === 0 ? (
                    <div className="text-center py-4">
                        <div className="text-sm text-muted-foreground mb-2">
                            No highlights found on this page
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Select text and click the Logseq Copilot button to create highlights
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {highlights.map((highlight, index) => {
                            const isHidden = hiddenHighlights.has(highlight.id);

                            return (
                                <div key={highlight.id} className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-foreground mb-1">
                                                "{truncateText(highlight.range.textContent)}"
                                            </div>

                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{formatDate(highlight.createdAt)}</span>
                                                {highlight.color && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="h-4 px-1.5 py-0"
                                                        style={{
                                                            backgroundColor: `rgba(${highlight.color === 'yellow' ? '255, 255, 0' : '255, 192, 203'}, 0.2)`
                                                        }}
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
                                                <div className="text-xs text-muted-foreground mt-1 italic">
                                                    Note: {highlight.note}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToggleVisibility(highlight.id)}
                                                className="h-6 w-6 p-0"
                                                title={isHidden ? "Show highlight" : "Hide highlight"}
                                            >
                                                {isHidden ? (
                                                    <IconEyeOff className="h-3 w-3" />
                                                ) : (
                                                    <IconEye className="h-3 w-3" />
                                                )}
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteHighlight(highlight.id)}
                                                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                                title="Delete highlight"
                                            >
                                                <IconTrash className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>

                                    {index < highlights.length - 1 && <Separator />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
} 