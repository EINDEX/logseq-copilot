import { detectTheme } from './theme-detection';

/**
 * Test theme detection functionality
 * This function can be called from browser console to debug theme detection
 */
export function testThemeDetection() {
  console.log('=== Logseq Copilot Theme Detection Test ===');

  // Basic info
  console.log('Current URL:', window.location.href);
  console.log('Hostname:', window.location.hostname);

  // System preference
  const systemPreference = window.matchMedia(
    '(prefers-color-scheme: dark)',
  ).matches;
  console.log('System prefers dark mode:', systemPreference);

  // HTML element analysis
  console.log(
    'HTML element classes:',
    Array.from(document.documentElement.classList),
  );
  console.log('HTML element attributes:');
  [
    'data-dark',
    'data-theme',
    'data-color-scheme',
    'data-color-mode',
    'theme',
  ].forEach((attr) => {
    const value = document.documentElement.getAttribute(attr);
    if (value) {
      console.log(`  ${attr}: ${value}`);
    }
  });

  // Body element analysis
  console.log('Body element classes:', Array.from(document.body.classList));
  console.log('Body element attributes:');
  ['data-theme', 'data-color-scheme', 'theme'].forEach((attr) => {
    const value = document.body.getAttribute(attr);
    if (value) {
      console.log(`  ${attr}: ${value}`);
    }
  });

  // Computed styles
  const htmlStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);

  console.log('HTML computed styles:');
  console.log('  background-color:', htmlStyle.backgroundColor);
  console.log('  color:', htmlStyle.color);

  console.log('Body computed styles:');
  console.log('  background-color:', bodyStyle.backgroundColor);
  console.log('  color:', bodyStyle.color);

  // Google-specific checks
  if (window.location.hostname.includes('google.')) {
    console.log('=== Google-specific checks ===');
    console.log(
      'Dark elements found:',
      document.querySelectorAll('[data-ved][data-dark="1"]').length,
    );
    console.log('Dark theme selectors:');
    [
      '[data-theme="dark"]',
      '.dark-theme',
      '[data-darkmode="true"]',
      '[data-color-scheme="dark"]',
    ].forEach((selector) => {
      const element = document.querySelector(selector);
      console.log(`  ${selector}:`, element ? 'found' : 'not found');
    });
  }

  // Final detection result
  const detectedTheme = detectTheme();
  console.log('=== Final Result ===');
  console.log('Detected theme:', detectedTheme);

  return detectedTheme;
}

// Make it available globally for console testing
if (typeof window !== 'undefined') {
  (window as any).testLogseqTheme = testThemeDetection;
}
