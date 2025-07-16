import React from 'react';
import { Plus, RefreshCw, Settings, ExternalLink, Search, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { browser } from 'wxt/browser';

interface QuickActionsProps {
    onQuickCapture: () => void;
    onRefresh: () => void;
    onOpenSettings: () => void;
    onOpenLogseq: () => void;
    isLoading?: boolean;
    hasGraph?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
    onQuickCapture,
    onRefresh,
    onOpenSettings,
    onOpenLogseq,
    isLoading = false,
    hasGraph = false,
}) => {
    const openNewTab = () => {
        browser.tabs.create({ url: 'chrome://newtab/' });
        window.close();
    };

    return (
        <div className="space-y-3">
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

            <Separator />

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