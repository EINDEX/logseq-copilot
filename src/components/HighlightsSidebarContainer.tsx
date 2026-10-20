import React, { useState, useEffect } from 'react';
import { ThemedHighlightsSidebar } from './HighlightsSidebar';
import { HighlightsSidebarToggle } from './HighlightsSidebarToggle';
import { HighlightService } from '@/utils/highlight-service';
import { ThemeProvider } from './ThemeProvider';
import { contentEvents } from '@/utils/content-events';
import log from '@/utils/logger';

export function HighlightsSidebarContainer() {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightCount, setHighlightCount] = useState(0);

    useEffect(() => {
        // Load initial highlight count for current page
        loadHighlightCount();

        // Listen for highlight changes
        const interval = setInterval(loadHighlightCount, 5000); // Check every 5 seconds

        // Refresh when highlights are added/removed (in-memory content-script
        // event bus, not DOM events that page scripts could forge)
        const offAdded = contentEvents.on('highlightAdded', () => loadHighlightCount());
        const offRemoved = contentEvents.on('highlightRemoved', () => loadHighlightCount());

        return () => {
            clearInterval(interval);
            offAdded();
            offRemoved();
        };
    }, []);

    const loadHighlightCount = async () => {
        try {
            const pageHighlights = await HighlightService.getCurrentPageHighlights();
            setHighlightCount(pageHighlights.length);
        } catch (error) {
            log.error('Failed to load highlight count:', error);
        }
    };

    const handleToggle = () => {
        setIsOpen(!isOpen);
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    // Listen for keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ctrl/Cmd + Shift + H to toggle sidebar
            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'H') {
                event.preventDefault();
                handleToggle();
            }
            // Escape to close sidebar
            if (event.key === 'Escape' && isOpen) {
                event.preventDefault();
                handleClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    return (
        <ThemeProvider>
            <HighlightsSidebarToggle
                isOpen={isOpen}
                onToggle={handleToggle}
                highlightCount={highlightCount}
            />
            <ThemedHighlightsSidebar
                isOpen={isOpen}
                onClose={handleClose}
            />
        </ThemeProvider>
    );
} 