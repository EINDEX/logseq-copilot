import React from 'react';
import { Plus, RefreshCw, Settings, ExternalLink, Search, BookOpen, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { browser } from 'wxt/browser';

interface QuickActionsProps {
    onQuickCapture: () => void;
    onRefresh: () => void;
    onOpenSettings: () => void;
    onOpenLogseq: () => void;
    onOpenSidebar: () => void;
    isLoading?: boolean;
    hasGraph?: boolean;
    /** The window to open the sidebar in is known. */
    canOpenSidebar?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
    onQuickCapture,
    onRefresh,
    onOpenSettings,
    onOpenLogseq,
    onOpenSidebar,
    isLoading = false,
    hasGraph = false,
    canOpenSidebar = false,
}) => {
    const openNewTab = () => {
        // No url opens the browser's own new tab page (chrome://newtab/ is
        // Chromium-only and invalid in Firefox).
        browser.tabs.create({});
        window.close();
    };

    return (
        <div className="space-y-1">
            {/* Primary Actions */}
            <div className="grid grid-cols-2 gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onQuickCapture}
                    className="flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Quick Capture
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="flex items-center gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
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