import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ThemeProvider } from '@/components/ThemeProvider';
import {
    IconHighlight,
    IconSearch,
    IconFilter,
    IconX,
    IconChevronLeft,
    IconChevronRight,
    IconTrash,
    IconEdit,
    IconCalendar,
    IconGlobe,
    IconEye,
    IconEyeOff
} from '@tabler/icons-react';
import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import type { HighlightData } from '@/types/highlight';
import { zIndex } from '@/entrypoints/content/QuickCapture';

interface HighlightsSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function HighlightsSidebar({ isOpen, onClose }: HighlightsSidebarProps) {
    const [highlights, setHighlights] = useState<HighlightData[]>([]);
    const [filteredHighlights, setFilteredHighlights] = useState<HighlightData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPageOnly, setCurrentPageOnly] = useState(true);
    const [hiddenHighlights, setHiddenHighlights] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            loadHighlights();
        }
    }, [isOpen, currentPageOnly]);

    useEffect(() => {
        // Filter highlights based on search query
        const filtered = highlights.filter(highlight => {
            const matchesSearch = !searchQuery ||
                highlight.range.textContent.toLowerCase().includes(searchQuery.toLowerCase()) ||
                highlight.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                highlight.title.toLowerCase().includes(searchQuery.toLowerCase());

            return matchesSearch;
        });
        setFilteredHighlights(filtered);
    }, [highlights, searchQuery]);

    const loadHighlights = async () => {
        try {
            setLoading(true);
            let allHighlights: HighlightData[] = [];

            if (currentPageOnly) {
                allHighlights = await HighlightService.getCurrentPageHighlights();
            } else {
                allHighlights = await HighlightService.getHighlights({
                    sortBy: 'lastAccessedAt',
                    sortOrder: 'desc',
                    limit: 100 // Limit to recent 100 highlights for performance
                });
            }

            setHighlights(allHighlights);
        } catch (error) {
            console.error('Failed to load highlights:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteHighlight = async (highlightId: string) => {
        if (!confirm('Are you sure you want to delete this highlight?')) {
            return;
        }

        try {
            const highlightManager = HighlightManager.getInstance();
            const success = await highlightManager.removeHighlight(highlightId);

            if (success) {
                setHighlights(prev => prev.filter(h => h.id !== highlightId));
                setFilteredHighlights(prev => prev.filter(h => h.id !== highlightId));
            }
        } catch (error) {
            console.error('Failed to delete highlight:', error);
        }
    };

    const handleToggleVisibility = async (highlightId: string) => {
        const isHidden = hiddenHighlights.has(highlightId);
        const highlightManager = HighlightManager.getInstance();

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
                await highlightManager.displayHighlight(highlight);
            }
        } else {
            // Hide highlight visually (but don't delete from storage)
            setHiddenHighlights(prev => new Set(prev).add(highlightId));

            // Remove from visual display
            const highlight = highlights.find(h => h.id === highlightId);
            if (highlight) {
                // For now, we'll just track in state. 
                // In a full implementation, we'd need a method to hide without deleting
                console.log('Hiding highlight:', highlightId);
            }
        }
    };

        const handleHighlightClick = async (highlight: HighlightData) => {
        try {
            // Update last accessed time
            await HighlightService.updateLastAccessed(highlight.id);
            
            // Try to scroll to the highlight if it's on the current page
            if (highlight.url === window.location.href) {
                const highlightManager = HighlightManager.getInstance();
                const success = await highlightManager.scrollToHighlight(highlight.id);
                if (!success) {
                    console.warn('Could not scroll to highlight, it may no longer exist on the page');
                }
            } else {
                // Open the page with the highlight
                window.open(highlight.url, '_blank');
            }
        } catch (error) {
            console.error('Failed to handle highlight click:', error);
        }
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    const truncateText = (text: string, maxLength: number = 100) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    const sidebarStyles: React.CSSProperties = {
        position: 'fixed',
        top: '0',
        right: isOpen ? '0' : '-400px',
        width: window.innerWidth < 768 ? '100vw' : '400px',
        height: '100vh',
        backgroundColor: 'var(--background, #ffffff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRight: 'none',
        boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.15)',
        zIndex: zIndex,
        transition: 'right 0.3s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
    };

    if (!isOpen) {
        return null;
    }

    return (
        <div style={sidebarStyles}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                    <IconHighlight className="h-5 w-5 text-primary" />
                    <h2 className="font-semibold text-lg">Highlights</h2>
                    <Badge variant="outline" className="text-xs">
                        {filteredHighlights.length}
                    </Badge>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-8 w-8 p-0"
                >
                    <IconX className="h-4 w-4" />
                </Button>
            </div>

            {/* Controls */}
            <div className="p-4 border-b border-border space-y-3">
                {/* Search */}
                <div className="relative">
                    <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search highlights..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {/* Filter buttons */}
                <div className="flex gap-2">
                    <Button
                        variant={currentPageOnly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPageOnly(true)}
                        className="flex-1"
                    >
                        This Page
                    </Button>
                    <Button
                        variant={!currentPageOnly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPageOnly(false)}
                        className="flex-1"
                    >
                        All Sites
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="text-center text-muted-foreground py-8">
                        Loading highlights...
                    </div>
                ) : filteredHighlights.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                        {highlights.length === 0 ? (
                            <>
                                <IconHighlight className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>No highlights yet</p>
                                <p className="text-xs mt-1">Select text on any page to create highlights</p>
                            </>
                        ) : (
                            <>
                                <IconSearch className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>No highlights match your search</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                                                 {filteredHighlights.map((highlight) => (
                             <Card
                                 key={highlight.id}
                                 className="group cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-yellow-400 highlights-sidebar-card"
                                 onClick={() => handleHighlightClick(highlight)}
                             >
                                <CardContent className="p-4">
                                    {/* Highlight text */}
                                    <div className="mb-2">
                                        <p className="text-sm font-medium text-foreground leading-relaxed">
                                            "{truncateText(highlight.range.textContent, 120)}"
                                        </p>
                                    </div>

                                    {/* Note if exists */}
                                    {highlight.note && (
                                        <div className="mb-2 p-2 bg-muted rounded text-xs">
                                            <p className="text-muted-foreground">
                                                {truncateText(highlight.note, 80)}
                                            </p>
                                        </div>
                                    )}

                                    {/* Metadata */}
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <IconGlobe className="h-3 w-3" />
                                            <span className="truncate max-w-32">
                                                {highlight.hostname}
                                            </span>
                                            <IconCalendar className="h-3 w-3 ml-1" />
                                            <span>{formatDate(highlight.createdAt)}</span>
                                        </div>
                                    </div>

                                    {/* Tags if exists */}
                                    {highlight.tags && highlight.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {highlight.tags.slice(0, 3).map((tag) => (
                                                <Badge key={tag} variant="secondary" className="text-xs">
                                                    {tag}
                                                </Badge>
                                            ))}
                                            {highlight.tags.length > 3 && (
                                                <Badge variant="secondary" className="text-xs">
                                                    +{highlight.tags.length - 3}
                                                </Badge>
                                            )}
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex justify-end gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggleVisibility(highlight.id);
                                            }}
                                            className="h-6 w-6 p-0"
                                        >
                                            {hiddenHighlights.has(highlight.id) ? (
                                                <IconEyeOff className="h-3 w-3" />
                                            ) : (
                                                <IconEye className="h-3 w-3" />
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteHighlight(highlight.id);
                                            }}
                                            className="h-6 w-6 p-0 text-destructive"
                                        >
                                            <IconTrash className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border">
                <div className="text-xs text-muted-foreground text-center">
                    {currentPageOnly ? (
                        `${filteredHighlights.length} highlights on this page`
                    ) : (
                        `${filteredHighlights.length} of your recent highlights`
                    )}
                </div>
            </div>
        </div>
    );
}

// Themed wrapper component
export function ThemedHighlightsSidebar(props: HighlightsSidebarProps) {
    return (
        <ThemeProvider>
            <HighlightsSidebar {...props} />
        </ThemeProvider>
    );
} 