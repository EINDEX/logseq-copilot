import { detectTheme } from './theme-detection';
import log from './logger';

/**
 * Test theme detection functionality
 * This function can be called from browser console to debug theme detection
 */
export function testThemeDetection() {
  log.debug('=== Logseq Copilot Theme Detection Test ===');

  // Basic info
  log.debug('Current URL:', window.location.href);
  log.debug('Hostname:', window.location.hostname);

  // System preference
  const systemPreference = window.matchMedia(
    '(prefers-color-scheme: dark)',
  ).matches;
  log.debug('System prefers dark mode:', systemPreference);

  // HTML element analysis
  log.debug(
    'HTML element classes:',
    Array.from(document.documentElement.classList),
  );
  log.debug('HTML element attributes:');
  [
    'data-dark',
    'data-theme',
    'data-color-scheme',
    'data-color-mode',
    'theme',
  ].forEach((attr) => {
    const value = document.documentElement.getAttribute(attr);
    if (value) {
      log.debug(`  ${attr}: ${value}`);
    }
  });

  // Body element analysis
  log.debug('Body element classes:', Array.from(document.body.classList));
  log.debug('Body element attributes:');
  ['data-theme', 'data-color-scheme', 'theme'].forEach((attr) => {
    const value = document.body.getAttribute(attr);
    if (value) {
      log.debug(`  ${attr}: ${value}`);
    }
  });

  // Computed styles
  const htmlStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);

  log.debug('HTML computed styles:');
  log.debug('  background-color:', htmlStyle.backgroundColor);
  log.debug('  color:', htmlStyle.color);

  log.debug('Body computed styles:');
  log.debug('  background-color:', bodyStyle.backgroundColor);
  log.debug('  color:', bodyStyle.color);

  // Google-specific checks
  if (window.location.hostname.includes('google.')) {
    log.debug('=== Google-specific checks ===');
    log.debug(
      'Dark elements found:',
      document.querySelectorAll('[data-ved][data-dark="1"]').length,
    );
    log.debug('Dark theme selectors:');
    [
      '[data-theme="dark"]',
      '.dark-theme',
      '[data-darkmode="true"]',
      '[data-color-scheme="dark"]',
    ].forEach((selector) => {
      const element = document.querySelector(selector);
      log.debug(`  ${selector}:`, element ? 'found' : 'not found');
    });
  }

  // Final detection result
  const detectedTheme = detectTheme();
  log.debug('=== Final Result ===');
  log.debug('Detected theme:', detectedTheme);

  return detectedTheme;
}

// Make it available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).testLogseqTheme = testThemeDetection;
}
