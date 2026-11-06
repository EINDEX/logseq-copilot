import React from 'react';
import { Plus, TextSelect } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ClipAction = 'page' | 'selection';

interface QuickActionsProps {
    onQuickCapture: () => void;
    onClipSelection: () => void;
    /** The active tab has a selection its content script can clip. */
    canClipSelection?: boolean;
    /** A clip is on its way to Logseq. */
    clipping?: boolean;
    /**
     * The last clip failed. `message` is shown under the clip actions; null
     * when the search error (#search-error) already shows the same text.
     */
    clipError?: { action: ClipAction; message: string | null } | null;
}

/** The two clip actions of the popup, and the error of a failed clip. */
export const QuickActions: React.FC<QuickActionsProps> = ({
    onQuickCapture,
    onClipSelection,
    canClipSelection = false,
    clipping = false,
    clipError = null,
}) => {
    const clipErrorId = clipError?.message ? 'clip-error' : 'search-error';

    return (
        <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onQuickCapture}
                    disabled={clipping}
                    aria-invalid={clipError?.action === 'page' || undefined}
                    aria-describedby={clipError?.action === 'page' ? clipErrorId : undefined}
                    className="flex min-w-0 items-center gap-2 dark:aria-invalid:border-destructive"
                >
                    <Plus className="w-4 h-4" />
                    Clip page
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onClipSelection}
                    disabled={!canClipSelection || clipping}
                    aria-invalid={clipError?.action === 'selection' || undefined}
                    aria-describedby={clipError?.action === 'selection' ? clipErrorId : undefined}
                    className="flex min-w-0 items-center gap-2 dark:aria-invalid:border-destructive"
                >
                    <TextSelect className="w-4 h-4" />
                    Clip selection
                </Button>
            </div>
            {clipError?.message && (
                <p
                    id="clip-error"
                    role="alert"
                    className="text-xs text-destructive whitespace-pre-line break-words"
                >
                    {clipError.message}
                </p>
            )}
        </div>
    );
};
