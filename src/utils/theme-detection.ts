/**
 * Enhanced theme detection utilities for content script
 * Supports various search engines and popular websites
 */

export type Theme = 'light' | 'dark';

/**
 * Detect theme from various sources with priority order
 */
export function detectTheme(): Theme {
  console.debug('[Theme Detection] Starting theme detection...');

  // 1. Check specific search engines and popular sites
  const siteSpecificDark = detectSiteSpecificDarkMode();
  if (siteSpecificDark !== null) {
    console.debug(
      '[Theme Detection] Site-specific detection result:',
      siteSpecificDark,
    );
    return siteSpecificDark;
  }

  // 2. Check host page theme indicators
  const hostPageDark = detectHostPageTheme();
  if (hostPageDark !== null) {
    console.debug(
      '[Theme Detection] Host page detection result:',
      hostPageDark,
    );
    return hostPageDark;
  }

  // 3. Check computed styles heuristic
  const computedStyleDark = detectFromComputedStyles();
  if (computedStyleDark !== null) {
    console.debug(
      '[Theme Detection] Computed styles detection result:',
      computedStyleDark,
    );
    return computedStyleDark;
  }

  // 4. Fallback to system preference
  const systemPreference = window.matchMedia('(prefers-color-scheme: dark)')
    .matches
    ? 'dark'
    : 'light';
  console.debug(
    '[Theme Detection] System preference fallback:',
    systemPreference,
  );
  return systemPreference;
}

/**
 * Detect dark mode for specific sites
 */
function detectSiteSpecificDarkMode(): Theme | null {
  const hostname = window.location.hostname;
  console.debug(
    '[Theme Detection] Checking site-specific detection for:',
    hostname,
  );

  // Google Search
  if (hostname.includes('google.')) {
    console.debug('[Theme Detection] Detecting Google theme...');

    // Method 1: Check data-dark attribute
    const dataAttr = document.documentElement.getAttribute('data-dark');
    console.debug('[Theme Detection] Google data-dark attribute:', dataAttr);

    // Method 2: Check body classes
    const bodyClasses = Array.from(document.body.classList);
    console.debug('[Theme Detection] Google body classes:', bodyClasses);

    // Method 3: Check html classes
    const htmlClasses = Array.from(document.documentElement.classList);
    console.debug('[Theme Detection] Google html classes:', htmlClasses);

    // Method 4: Check for dark mode specific elements
    const darkElements = document.querySelectorAll('[data-ved][data-dark="1"]');
    console.debug(
      '[Theme Detection] Google dark elements found:',
      darkElements.length,
    );

    // Method 5: Check computed background color
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    console.debug('[Theme Detection] Google body background:', bodyBg);
    console.debug('[Theme Detection] Google html background:', htmlBg);

    // Method 6: Check for dark theme specific selectors
    const darkModeIndicators = [
      document.querySelector('[data-theme="dark"]'),
      document.querySelector('.dark-theme'),
      document.querySelector('[data-darkmode="true"]'),
      document.querySelector('[data-color-scheme="dark"]'),
    ];
    console.debug(
      '[Theme Detection] Google dark mode indicators:',
      darkModeIndicators.some((el) => el !== null),
    );

    // Method 7: Check background color luminance
    const bgRgb = parseRgbColor(bodyBg) || parseRgbColor(htmlBg);
    if (bgRgb) {
      const luminance = calculateLuminance(bgRgb);
      console.debug(
        '[Theme Detection] Google background luminance:',
        luminance,
      );
      if (luminance < 0.5) {
        console.debug(
          '[Theme Detection] Google detected as dark based on luminance',
        );
        return 'dark';
      }
    }

    // Enhanced detection logic
    const isDark =
      dataAttr === 'true' ||
      dataAttr === '1' ||
      document.body.classList.contains('dark') ||
      document.documentElement.classList.contains('dark') ||
      document.body.classList.contains('dark-mode') ||
      document.documentElement.classList.contains('dark-mode') ||
      darkElements.length > 0 ||
      darkModeIndicators.some((el) => el !== null) ||
      (bgRgb && calculateLuminance(bgRgb) < 0.5);

    console.debug(
      '[Theme Detection] Google final result:',
      isDark ? 'dark' : 'light',
    );
    return isDark ? 'dark' : 'light';
  }

  // DuckDuckGo
  if (hostname.includes('duckduckgo.')) {
    console.debug('[Theme Detection] Detecting DuckDuckGo theme...');
    const isDark =
      document.querySelector('.dark-bg') !== null ||
      document.body.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    console.debug(
      '[Theme Detection] DuckDuckGo result:',
      isDark ? 'dark' : 'light',
    );
    return isDark ? 'dark' : 'light';
  }

  // Bing
  if (hostname.includes('bing.')) {
    console.debug('[Theme Detection] Detecting Bing theme...');
    const isDark =
      document.body.classList.contains('dark') ||
      document.documentElement.classList.contains('dark') ||
      document.querySelector('[data-theme="dark"]') !== null;
    console.debug('[Theme Detection] Bing result:', isDark ? 'dark' : 'light');
    return isDark ? 'dark' : 'light';
  }

  // Baidu
  if (hostname.includes('baidu.')) {
    console.debug('[Theme Detection] Detecting Baidu theme...');
    const isDark =
      document.body.classList.contains('dark') ||
      document.documentElement.classList.contains('dark');
    console.debug('[Theme Detection] Baidu result:', isDark ? 'dark' : 'light');
    return isDark ? 'dark' : 'light';
  }

  // Yandex
  if (hostname.includes('yandex.')) {
    console.debug('[Theme Detection] Detecting Yandex theme...');
    const isDark =
      document.body.classList.contains('dark') ||
      document.documentElement.classList.contains('dark');
    console.debug(
      '[Theme Detection] Yandex result:',
      isDark ? 'dark' : 'light',
    );
    return isDark ? 'dark' : 'light';
  }

  // GitHub
  if (hostname.includes('github.')) {
    console.debug('[Theme Detection] Detecting GitHub theme...');
    const isDark =
      document.documentElement.getAttribute('data-color-mode') === 'dark' ||
      document.documentElement.getAttribute('data-dark-theme') !== null;
    console.debug(
      '[Theme Detection] GitHub result:',
      isDark ? 'dark' : 'light',
    );
    return isDark ? 'dark' : 'light';
  }

  // Twitter/X
  if (hostname.includes('twitter.') || hostname.includes('x.com')) {
    console.debug('[Theme Detection] Detecting Twitter/X theme...');
    const isDark =
      document.body.style.backgroundColor.includes('rgb(0, 0, 0)') ||
      document.documentElement.style.colorScheme === 'dark';
    console.debug(
      '[Theme Detection] Twitter/X result:',
      isDark ? 'dark' : 'light',
    );
    return isDark ? 'dark' : 'light';
  }

  // YouTube
  if (hostname.includes('youtube.')) {
    console.debug('[Theme Detection] Detecting YouTube theme...');
    const isDark =
      document.documentElement.getAttribute('dark') === 'true' ||
      document.body.classList.contains('dark');
    console.debug(
      '[Theme Detection] YouTube result:',
      isDark ? 'dark' : 'light',
    );
    return isDark ? 'dark' : 'light';
  }

  console.debug('[Theme Detection] No site-specific detection available');
  return null;
}

/**
 * Detect theme from common host page indicators
 */
function detectHostPageTheme(): Theme | null {
  console.debug('[Theme Detection] Checking host page theme indicators...');

  const indicators = [
    // Class-based indicators
    document.documentElement.classList.contains('dark'),
    document.documentElement.classList.contains('dark-mode'),
    document.documentElement.classList.contains('theme-dark'),
    document.body.classList.contains('dark'),
    document.body.classList.contains('dark-mode'),
    document.body.classList.contains('theme-dark'),

    // Attribute-based indicators
    document.documentElement.getAttribute('data-theme') === 'dark',
    document.documentElement.getAttribute('data-color-scheme') === 'dark',
    document.documentElement.getAttribute('data-color-mode') === 'dark',
    document.documentElement.getAttribute('theme') === 'dark',
    document.body.getAttribute('data-theme') === 'dark',
    document.body.getAttribute('data-color-scheme') === 'dark',
  ];

  const hasDarkIndicator = indicators.some((indicator) => indicator);
  console.debug('[Theme Detection] Dark indicators found:', hasDarkIndicator);

  if (hasDarkIndicator) {
    return 'dark';
  }

  // Check for light mode indicators
  const lightIndicators = [
    document.documentElement.classList.contains('light'),
    document.documentElement.classList.contains('light-mode'),
    document.documentElement.getAttribute('data-theme') === 'light',
    document.documentElement.getAttribute('data-color-scheme') === 'light',
    document.body.classList.contains('light'),
    document.body.classList.contains('light-mode'),
  ];

  const hasLightIndicator = lightIndicators.some((indicator) => indicator);
  console.debug('[Theme Detection] Light indicators found:', hasLightIndicator);

  if (hasLightIndicator) {
    return 'light';
  }

  return null;
}

/**
 * Detect theme from computed styles
 */
function detectFromComputedStyles(): Theme | null {
  console.debug('[Theme Detection] Checking computed styles...');

  try {
    const computedStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);

    const htmlBg = computedStyle.backgroundColor;
    const bodyBg = bodyStyle.backgroundColor;
    const htmlText = computedStyle.color;
    const bodyText = bodyStyle.color;

    console.debug('[Theme Detection] HTML background:', htmlBg);
    console.debug('[Theme Detection] Body background:', bodyBg);
    console.debug('[Theme Detection] HTML text:', htmlText);
    console.debug('[Theme Detection] Body text:', bodyText);

    // Try both body and html backgrounds
    const bgColor = bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : htmlBg;
    const textColor = bodyText !== 'rgba(0, 0, 0, 0)' ? bodyText : htmlText;

    // Parse RGB values
    const bgRgb = parseRgbColor(bgColor);
    const textRgb = parseRgbColor(textColor);

    if (bgRgb && textRgb) {
      // Calculate luminance
      const bgLuminance = calculateLuminance(bgRgb);
      const textLuminance = calculateLuminance(textRgb);

      console.debug('[Theme Detection] Background luminance:', bgLuminance);
      console.debug('[Theme Detection] Text luminance:', textLuminance);

      // If background is significantly darker than text, it's likely dark mode
      if (bgLuminance < textLuminance && bgLuminance < 0.5) {
        console.debug(
          '[Theme Detection] Detected dark mode from computed styles',
        );
        return 'dark';
      }

      // If background is significantly lighter than text, it's likely light mode
      if (bgLuminance > textLuminance && bgLuminance > 0.5) {
        console.debug(
          '[Theme Detection] Detected light mode from computed styles',
        );
        return 'light';
      }
    }
  } catch (error) {
    console.debug('Error detecting theme from computed styles:', error);
  }

  return null;
}

/**
 * Parse RGB color string to RGB values
 */
function parseRgbColor(color: string): [number, number, number] | null {
  if (!color) return null;

  // Handle rgb() and rgba() formats
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  }

  // Handle hex colors
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return [
      parseInt(hex.substr(0, 2), 16),
      parseInt(hex.substr(2, 2), 16),
      parseInt(hex.substr(4, 2), 16),
    ];
  }

  return null;
}

/**
 * Calculate relative luminance
 */
function calculateLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Setup theme change listeners
 */
export function setupThemeChangeListeners(
  callback: (theme: Theme) => void,
): () => void {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleChange = () => {
    console.debug('[Theme Detection] Theme change detected, re-detecting...');
    const newTheme = detectTheme();
    callback(newTheme);
  };

  // Listen for system theme changes
  mediaQuery.addEventListener('change', handleChange);

  // Listen for DOM changes that might indicate theme changes
  const observer = new MutationObserver(handleChange);

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      'class',
      'data-theme',
      'data-color-scheme',
      'data-color-mode',
      'data-dark',
      'theme',
      'style',
    ],
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'],
  });

  return () => {
    mediaQuery.removeEventListener('change', handleChange);
    observer.disconnect();
  };
}
