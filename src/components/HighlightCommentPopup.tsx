import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { IconX, IconCheck, IconEdit, IconLinkOff, IconTrash } from '@tabler/icons-react';
import type { HighlightData } from '@/types/highlight';
import { HighlightImage } from './HighlightImage';
import { HighlightService } from '@/utils/highlight-service';
import { HighlightManager } from '@/utils/highlight-manager';
import { ThemeProvider } from '@/components/ThemeProvider';
import { zIndex } from '@/utils/z-index';
import log from '@/utils/logger';
import { sendMessage } from '@/types/messaging';
import { clipErrorMessage } from '@/utils/clip-feedback';
import { intlLocale } from '@/i18n/language';
import { useTranslation } from '@/i18n/react';

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
    const { t, i18n } = useTranslation();
    const [isEditing, setIsEditing] = useState(false);
    const [comment, setComment] = useState(highlightData.note || '');
    const [isSaving, setIsSaving] = useState(false);
    // Why the comment is not in Logseq; the local comment is saved either way.
    const [syncError, setSyncError] = useState<string | null>(null);
    // The clip was found deleted in Logseq: the highlight is no longer linked.
    const [removedFromLogseq, setRemovedFromLogseq] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        // Ask once when the popup opens for a linked highlight. Nothing is
        // known when Logseq cannot be asked: the link stays.
        if (!highlightData.logseq) return;
        let disposed = false;
        sendMessage('logseq:checkHighlightLinks', { ids: [highlightData.id] })
            .then((ids) => {
                if (!disposed && ids.includes(highlightData.id)) setRemovedFromLogseq(true);
            })
            .catch(() => {});
        return () => {
            disposed = true;
        };
    }, [highlightData.id]);

    useEffect(() => {
        // Auto-focus textarea when entering edit mode
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [isEditing]);

    useEffect(() => {
        // Close popup when clicking outside
        const handleClickOutside = (event: MouseEvent) => {
            // The popup lives in a shadow root: on `document` a click inside it
            // is retargeted to the shadow host, so the host counts as inside.
            const root = popupRef.current?.getRootNode();
            if (root instanceof ShadowRoot && event.target === root.host) return;
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
            const next = comment.trim();
            // A failed sync is tried again by the next save, even unchanged.
            const needsSync =
                !!highlightData.logseq &&
                (syncError !== null || next !== (highlightData.note ?? '').trim());
            const result = await HighlightService.updateHighlight(highlightData.id, {
                note: next || undefined
            });

            if (result.success && result.data) {
                onUpdate(result.data as HighlightData);
                setIsEditing(false);
                if (needsSync) {
                    try {
                        // False: the clip is gone and the link was dropped.
                        if (!(await sendMessage('logseq:syncHighlightNote', { id: highlightData.id }))) {
                            setRemovedFromLogseq(true);
                        }
                        setSyncError(null);
                    } catch (error) {
                        log.warn('Failed to sync the comment to Logseq:', error);
                        setSyncError(clipErrorMessage(error));
                    }
                }
            }
        } catch (error) {
            log.error('Failed to save comment:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteHighlight = async () => {
        if (!confirm(t('content.highlight.confirmDelete'))) {
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
        return new Date(timestamp).toLocaleDateString(intlLocale(i18n.language), {
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

    // Place the popup by its measured height so it can grow with its content
    // and still stay inside the viewport. Hidden until the first measurement.
    const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);

    useLayoutEffect(() => {
        const el = popupRef.current;
        if (!el) return;
        const popupWidth = 320;
        const padding = 10;

        const place = () => {
            const popupHeight = el.offsetHeight;
            let x = position.x;
            let y = position.y;

            if (x + popupWidth > window.innerWidth - padding) {
                x = window.innerWidth - popupWidth - padding;
            }
            if (x < padding) x = padding;

            // Prefer below the click point; flip above when it does not fit.
            if (y + popupHeight > window.innerHeight - padding) {
                y = position.y - popupHeight - padding;
            }
            // Clamp into the viewport (the bottom clamp wins over the top one
            // only when the content fits).
            y = Math.min(y, window.innerHeight - popupHeight - padding);
            if (y < padding) y = padding;

            setAdjustedPosition(prev =>
                prev && prev.x === x && prev.y === y ? prev : { x, y }
            );
        };

        place();
        const observer = new ResizeObserver(place);
        observer.observe(el);
        window.addEventListener('resize', place);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', place);
        };
    }, [position.x, position.y]);

    const popupStyle: React.CSSProperties = {
        position: 'fixed',
        left: `${adjustedPosition?.x ?? position.x}px`,
        top: `${adjustedPosition?.y ?? position.y}px`,
        visibility: adjustedPosition ? 'visible' : 'hidden',
        zIndex: parseInt(zIndex) + 1,
        width: '320px',
        // Last resort: scroll only when the viewport is shorter than the content.
        maxHeight: 'calc(100vh - 20px)',
        overflowY: 'auto',
        background: 'var(--background)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    };

      return (
    <div ref={popupRef} style={popupStyle} data-highlight-popup>
      <Card className="border-0 shadow-none">
                <CardHeader className="px-4 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm font-medium">
                            {t('content.highlight.title')}
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

                <CardContent className="space-y-3 px-4 pb-4">
                    {/* Highlighted text */}
                    {highlightData.image ? (
                        <div className="border-l-2 border-highlight pl-3">
                            <HighlightImage image={highlightData.image} />
                        </div>
                    ) : (
                        <p className="border-l-2 border-highlight pl-3 text-sm leading-relaxed">
                            {truncateText(highlightData.range.textContent)}
                        </p>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(highlightData.createdAt)}</span>
                        {highlightData.tags && highlightData.tags.length > 0 && (
                            <div className="flex gap-1">
                                {highlightData.tags.map(tag => (
                                    <Badge key={tag} variant="secondary" className="h-4 px-1.5 py-0 font-normal">
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                        )}
                        {removedFromLogseq && (
                            <span className="inline-flex items-center gap-1" data-removed-from-logseq>
                                <IconLinkOff className="h-3 w-3" aria-hidden />
                                {t('common.removedFromLogseq')}
                            </span>
                        )}
                    </div>

                    <Separator />

                    {/* Comment section */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{t('content.highlight.comment')}</span>
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
                                    {t('common.edit')}
                                </Button>
                            )}
                        </div>

                        {isEditing ? (
                            <div className="space-y-2">
                                <Textarea
                                    ref={textareaRef}
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder={t('content.highlight.placeholder')}
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
                                        {isSaving ? t('common.saving') : t('common.save')}
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
                                        {t('common.cancel')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">
                                {highlightData.note ? (
                                    <div className="whitespace-pre-wrap">{highlightData.note}</div>
                                ) : (
                                    <div className="italic">{t('content.highlight.empty')}</div>
                                )}
                            </div>
                        )}
                    </div>

                    {syncError && (
                        <p
                            role="alert"
                            data-comment-sync-error
                            className="whitespace-pre-line break-words border-l-2 border-destructive pl-3 text-xs text-destructive"
                        >
                            {syncError}
                        </p>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeleteHighlight}
                            className="h-7 px-2 text-muted-foreground hover:text-destructive"
                        >
                            <IconTrash className="h-3 w-3 mr-1" />
                            {t('common.delete')}
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