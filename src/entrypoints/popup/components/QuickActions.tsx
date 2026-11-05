import React from 'react';
import { Plus, RefreshCw, Settings, ExternalLink, Search, BookOpen, PanelRight, TextSelect } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { browser } from 'wxt/browser';

interface QuickActionsProps {
    onQuickCapture: () => void;
    onClipSelection: () => void;
    onRefresh: () => void;
    onOpenSettings: () => void;
    onOpenLogseq: () => void;
    onOpenSidebar: () => void;
    isLoading?: boolean;
    hasGraph?: boolean;
    /** The window to open the sidebar in is known. */
    canOpenSidebar?: boolean;
    /** The active tab has a selection its content script can clip. */
    canClipSelection?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
    onQuickCapture,
    onClipSelection,
    onRefresh,
    onOpenSettings,
    onOpenLogseq,
    onOpenSidebar,
    isLoading = false,
    hasGraph = false,
    canOpenSidebar = false,
    canClipSelection = false,
}) => {
    const openNewTab = () => {
        // No url opens the browser's own new tab page (chrome://newtab/ is
        // Chromium-only and invalid in Firefox).
        browser.tabs.create({});
        window.close();
    };

    return (
        <div className="space-y-1">
            {/* Primary Actions: the two clips, then Refresh */}
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onQuickCapture}
                    className="flex flex-1 min-w-0 items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Clip page
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onClipSelection}
                    disabled={!canClipSelection}
                    className="flex flex-1 min-w-0 items-center gap-2"
                >
                    <TextSelect className="w-4 h-4" />
                    Clip selection
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isLoading}
                    aria-label="Refresh"
                    title="Refresh"
                    className="h-8 w-8 shrink-0 p-0"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* Secondary Actions */}
            <div className="grid grid-cols-2 gap-2">
                {hasGraph && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onOpenLogseq}
                        className="flex items-center gap-2"
                    >
                        <BookOpen className="w-4 h-4" />
                        Open Graph
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenSidebar}
                    disabled={!canOpenSidebar}
                    title="Open highlights sidebar"
                    className="flex items-center gap-2"
                >
                    <PanelRight className="w-4 h-4" />
                    Highlights
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenSettings}
                    className="flex items-center gap-2"
                >
                    <Settings className="w-4 h-4" />
                    Settings
                </Button>
            </div>
        </div>
    );
}; 