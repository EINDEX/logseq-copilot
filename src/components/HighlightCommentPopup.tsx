import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { IconX, IconCheck, IconEdit, IconTrash } from '@tabler/icons-react';
import type { HighlightData } from '@/types/highlight';
import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import { ThemeProvider } from '@/components/ThemeProvider';
import { zIndex } from '@/utils/z-index';
import log from '@/utils/logger';

interface HighlightCommentPopupProps {
    highlightData: HighlightData;
    position: { x: number; y: number };
    onClose: () => void;
    onUpdate: (updatedHighlight: HighlightData) => void;
    onDelete: (highlightId: string) => void;
}

export function HighlightCommentPopup({
    highlightData,
    position,
    onClose,
    onUpdate,
    onDelete
}: HighlightCommentPopupProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [comment, setComment] = useState(highlightData.note || '');
    const [isSaving, setIsSaving] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        // Auto-focus textarea when entering edit mode
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isEditing]);

    useEffect(() => {
        // Close popup when clicking outside
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                if (isEditing) {
                    handleSaveComment();
                } else {
                    onClose();
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isEditing, comment]);

    useEffect(() => {
        // Handle escape key
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (isEditing) {
                    setIsEditing(false);
                    setComment(highlightData.note || '');
                } else {
                    onClose();
                }
            }
        };

        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [isEditing, highlightData.note]);

    const handleSaveComment = async () => {
        if (isSaving) return;

        setIsSaving(true);
        try {
            const result = await HighlightService.updateHighlight(highlightData.id, {
                note: comment.trim() || undefined
            });

            if (result.success && result.data) {
                onUpdate(result.data as HighlightData);
                setIsEditing(false);
            }
        } catch (error) {
            log.error('Failed to save comment:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteHighlight = async () => {
        if (!confirm('Are you sure you want to delete this highlight?')) {
            return;
        }

        try {
            const highlightManager = HighlightManager.getInstance();
            const success = await highlightManager.removeHighlight(highlightData.id);

            if (success) {
                onDelete(highlightData.id);
                onClose();
            }
        } catch (error) {
            log.error('Failed to delete highlight:', error);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const truncateText = (text: string, maxLength: number = 150) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    // Calculate popup position to stay within viewport
    const calculatePosition = () => {
        const popupWidth = 320;
        const popupHeight = 300;
        const padding = 10;

        let x = position.x;
        let y = position.y;

        // Adjust horizontal position
        if (x + popupWidth > window.innerWidth - padding) {
            x = window.innerWidth - popupWidth - padding;
        }
        if (x < padding) {
            x = padding;
        }

        // Adjust vertical position
        if (y + popupHeight > window.innerHeight - padding) {
            y = position.y - popupHeight - padding;
        }
        if (y < padding) {
            y = padding;
        }

        return { x, y };
    };

    const adjustedPosition = calculatePosition();

    const popupStyle: React.CSSProperties = {
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
        zIndex: parseInt(zIndex) + 1,
        width: '320px',
        maxHeight: '300px',
        overflow: 'auto',
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    };

      return (
    <div ref={popupRef} style={popupStyle} data-highlight-popup>
      <Card className="border-0 shadow-none">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium">
                            Highlight Comment
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="h-6 w-6 p-0"
                        >
                            <IconX className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-3">
                    {/* Highlighted text */}
                    <div className="text-sm bg-muted/50 p-2 rounded border-l-4 border-primary/50">
                        "{truncateText(highlightData.range.textContent)}"
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(highlightData.createdAt)}</span>
                        {highlightData.color && (
                            <Badge variant="secondary" className="h-4 px-1.5 py-0">
                                {highlightData.color}
                            </Badge>
                        )}
                        {highlightData.tags && highlightData.tags.length > 0 && (
                            <div className="flex gap-1">
                                {highlightData.tags.map(tag => (
                                    <Badge key={tag} variant="outline" className="h-4 px-1.5 py-0">
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* Comment section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Comment</span>
                            {!isEditing && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        // The note may have changed since the popup opened
                                        setComment(highlightData.note || '');
                                        setIsEditing(true);
                                    }}
                                    className="h-6 px-2"
                                >
                                    <IconEdit className="h-3 w-3 mr-1" />
                                    Edit
                                </Button>
                            )}
                        </div>

                        {isEditing ? (
                            <div className="space-y-2">
                                <Textarea
                                    ref={textareaRef}
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Add a comment to this highlight..."
                                    className="min-h-[80px] text-sm"
                                />
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={handleSaveComment}
                                        disabled={isSaving}
                                        className="h-7 px-3"
                                    >
                                        <IconCheck className="h-3 w-3 mr-1" />
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setIsEditing(false);
                                            setComment(highlightData.note || '');
                                        }}
                                        className="h-7 px-3"
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                {highlightData.note ? (
                                    <div className="whitespace-pre-wrap">{highlightData.note}</div>
                                ) : (
                                    <div className="italic">No comment added yet. Click Edit to add one.</div>
                                )}
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDeleteHighlight}
                            className="h-7 px-3 text-destructive hover:text-destructive"
                        >
                            <IconTrash className="h-3 w-3 mr-1" />
                            Delete
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export const ThemedHighlightCommentPopup = (props: HighlightCommentPopupProps) => {
    return (
        <ThemeProvider>
            <HighlightCommentPopup {...props} />
        </ThemeProvider>
    );
}; 