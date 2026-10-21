import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ThemeProvider } from '@/components/ThemeProvider';
import { HighlightList } from '@/components/HighlightList';
import {
    IconHighlight,
    IconSearch,
    IconFilter,
    IconX,
    IconChevronLeft,
    IconChevronRight,
    IconEdit,
    IconEye,
    IconEyeOff
} from '@tabler/icons-react';
import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import type { HighlightData } from '@/types/highlight';
import { zIndex } from '@/utils/z-index';
import { sendMessage } from '@/types/messaging';
import log from '@/utils/logger';

/**
 * In-page sidebar. It runs inside the host page (an open shadow root, which
 * page scripts can reach via element.shadowRoot), so it only ever loads the
 * highlights of the current page. The cross-site list lives on the extension's
 * own options page (Options > Highlights).
 */
interface HighlightsSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function HighlightsSidebar({ isOpen, onClose }: HighlightsSidebarProps) {
    const [highlights, setHighlights] = useState<HighlightData[]>([]);
    const [filteredHighlights, setFilteredHighlights] = useState<HighlightData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [hiddenHighlights, setHiddenHighlights] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            loadHighlights();
        }
    }, [isOpen]);

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
            const pageHighlights = await HighlightService.getCurrentPageHighlights();
            setHighlights(pageHighlights);
        } catch (error) {
            log.error('Failed to load highlights:', error);
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
            log.error('Failed to delete highlight:', error);
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
                log.debug('Hiding highlight:', highlightId);
            }
        }
    };

    const handleHighlightClick = async (highlightId: string) => {
        const highlight = highlights.find(h => h.id === highlightId);
        if (!highlight) return;

        try {
            // Update last accessed time
            await HighlightService.updateLastAccessed(highlight.id);
            
            // Try to scroll to the highlight if it's on the current page
            if (highlight.url === window.location.href) {
                const highlightManager = HighlightManager.getInstance();
                const success = await highlightManager.scrollToHighlight(highlight.id);
                if (!success) {
                    log.warn('Could not scroll to highlight, it may no longer exist on the page');
                }
            } else {
                // Open the page with the highlight
                window.open(highlight.url, '_blank');
            }
        } catch (error) {
            log.error('Failed to handle highlight click:', error);
        }
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

                {/* Highlights from other sites are only listed on the options page */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage('app:openOptions')}
                    className="w-full"
                >
                    All highlights (Options &gt; Highlights)
                </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="text-center text-muted-foreground py-8">
                        Loading highlights...
                    </div>
                ) : (
                    <HighlightList
                        highlights={filteredHighlights}
                        onSelect={handleHighlightClick}
                        onDelete={handleDeleteHighlight}
                        renderActions={(highlight) => (
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
                        )}
                        empty={
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
                        }
                    />
                )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border">
                <div className="text-xs text-muted-foreground text-center">
                    {`${filteredHighlights.length} highlights on this page`}
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