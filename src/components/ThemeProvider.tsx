import React, { useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';
import log from '@/utils/logger';

interface ThemeProviderProps {
    children: React.ReactNode;
}

/**
 * Theme provider component for content script environment
 * Automatically detects and applies theme based on host page and system preferences
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
    const { theme, isDark } = useTheme();

    useEffect(() => {
        log.debug('[ThemeProvider] Theme changed:', theme, 'isDark:', isDark);
    }, [isDark, theme]);

    // The `dark` class is rendered by React on our own container, inside the
    // shadow root. Nothing looks the container up through `host.shadowRoot`,
    // so this works the same with open and closed shadow roots.
    return (
        <div data-theme-container className={isDark ? 'dark' : ''}>
            {children}
        </div>
    );
}

/**
 * Higher-order component to wrap content script components with theme provider
 */
export function withTheme<P extends object>(
    Component: React.ComponentType<P>
): React.ComponentType<P> {
    return function ThemedComponent(props: P) {
        return (
            <ThemeProvider>
                <Component {...props} />
            </ThemeProvider>
        );
    };
} 