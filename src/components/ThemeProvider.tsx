import React, { useEffect } from 'react';
import { useTheme } from '@/hooks/use-theme';

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
        console.log('[ThemeProvider] Theme changed:', theme, 'isDark:', isDark);

        // Apply theme class to the container
        const applyTheme = () => {
            // Find all shadow roots that contain our components
            const shadowRoots = document.querySelectorAll('[data-wxt-shadow-root]');
            console.log('[ThemeProvider] Found shadow roots:', shadowRoots.length);

            shadowRoots.forEach((shadowHost, index) => {
                const shadowRoot = (shadowHost as any).shadowRoot;
                if (shadowRoot) {
                    console.log(`[ThemeProvider] Processing shadow root ${index + 1}`);

                    // Apply theme class to shadow root's first child (usually the container)
                    const container = shadowRoot.querySelector('[data-theme-container]');
                    if (container) {
                        console.log(`[ThemeProvider] Applying theme to container:`, container);
                        container.classList.toggle('dark', isDark);
                        console.log(`[ThemeProvider] Container classes after update:`, Array.from(container.classList));
                        
                        // Log computed styles to verify theme application
                        const computedStyle = getComputedStyle(container);
                        console.log('[ThemeProvider] Container computed background:', computedStyle.getPropertyValue('--background'));
                        console.log('[ThemeProvider] Container computed foreground:', computedStyle.getPropertyValue('--foreground'));
                    } else {
                        console.log(`[ThemeProvider] No theme container found in shadow root ${index + 1}`);
                        // Log all elements in shadow root for debugging
                        const allElements = shadowRoot.querySelectorAll('*');
                        console.log(`[ThemeProvider] Elements in shadow root ${index + 1}:`, Array.from(allElements).map(el => el.tagName + (el.className ? '.' + el.className : '')));
                    }
                }
            });
        };

        // Apply theme immediately
        applyTheme();

        // Also apply to any future shadow roots
        const observer = new MutationObserver((mutations) => {
            console.log('[ThemeProvider] DOM mutations detected, reapplying theme');
            applyTheme();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        return () => {
            observer.disconnect();
        };
    }, [isDark, theme]);

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