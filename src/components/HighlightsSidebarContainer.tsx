import React, { useState, useEffect } from 'react';
import { ThemedHighlightsSidebar } from './HighlightsSidebar';
import { HighlightsSidebarToggle } from './HighlightsSidebarToggle';
import { HighlightService } from '@/utils/highlight-service';
import { ThemeProvider } from './ThemeProvider';

export function HighlightsSidebarContainer() {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightCount, setHighlightCount] = useState(0);

    useEffect(() => {
        // Load initial highlight count for current page
        loadHighlightCount();

        // Listen for highlight changes
        const interval = setInterval(loadHighlightCount, 5000); // Check every 5 seconds

        // Listen for custom events when highlights are added/removed
        const handleHighlightChanged = () => {
            loadHighlightCount();
        };

        document.addEventListener('highlightAdded', handleHighlightChanged);
        document.addEventListener('highlightRemoved', handleHighlightChanged);

        return () => {
            clearInterval(interval);
            document.removeEventListener('highlightAdded', handleHighlightChanged);
            document.removeEventListener('highlightRemoved', handleHighlightChanged);
        };
    }, []);

    const loadHighlightCount = async () => {
        try {
            const pageHighlights = await HighlightService.getCurrentPageHighlights();
            setHighlightCount(pageHighlights.length);
        } catch (error) {
            console.error('Failed to load highlight count:', error);
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