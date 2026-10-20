import { useState, useEffect } from 'react';
import {
  detectTheme,
  setupThemeChangeListeners,
  type Theme,
} from '@/utils/theme-detection';

/**
 * Hook for detecting and managing theme in content script environment
 * Uses enhanced detection for various search engines and websites
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Initial theme detection
    const initialTheme = detectTheme();
    setTheme(initialTheme);

    // Setup theme change listeners
    const cleanup = setupThemeChangeListeners((newTheme) => {
      setTheme(newTheme);
    });

    return cleanup;
  }, []);

  return { theme, isDark: theme === 'dark' };
}
