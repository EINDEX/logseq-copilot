import React from 'react';
import { Button } from '@/components/ui/button';
import { IconHighlight, IconX } from '@tabler/icons-react';
import { zIndex } from '@/entrypoints/content/QuickCapture';

interface HighlightsSidebarToggleProps {
    isOpen: boolean;
    onToggle: () => void;
    highlightCount?: number;
}

export function HighlightsSidebarToggle({ isOpen, onToggle, highlightCount = 0 }: HighlightsSidebarToggleProps) {
    const isMobile = window.innerWidth < 768;
    const sidebarWidth = isMobile ? '100vw' : '400px';
    
    const buttonStyles: React.CSSProperties = {
        position: 'fixed',
        top: '50%',
        right: isOpen ? (isMobile ? '10px' : sidebarWidth) : '20px', // Position relative to sidebar
        transform: 'translateY(-50%)',
        zIndex: parseInt(zIndex) + 1, // Always on top of sidebar
        transition: 'right 0.3s ease-in-out',
        backgroundColor: 'var(--background, #ffffff)',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: isOpen && isMobile ? '8px' : '8px 0 0 8px',
        boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)',
        padding: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '40px',
        minHeight: '40px',
        cursor: 'pointer',
    };

    const badgeStyles: React.CSSProperties = {
        position: 'absolute',
        top: '-6px',
        right: '-6px',
        backgroundColor: 'var(--primary, #007bff)',
        color: 'var(--primary-foreground, #ffffff)',
        borderRadius: '50%',
        minWidth: '18px',
        height: '18px',
        fontSize: '10px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: '1',
    };

    return (
        <div style={buttonStyles} onClick={onToggle} title={isOpen ? 'Close highlights' : 'Open highlights'}>
            {isOpen ? (
                <IconX className="h-5 w-5 text-muted-foreground" />
            ) : (
                <>
                    <IconHighlight className="h-5 w-5 text-primary" />
                    {highlightCount > 0 && (
                        <div style={badgeStyles}>
                            {highlightCount > 99 ? '99+' : highlightCount}
                        </div>
                    )}
                </>
            )}
        </div>
    );
} 