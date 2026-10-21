import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import App from './App';

// This page has no host page to take the theme from (the in-page UI does), so
// it follows the browser's color scheme: `.dark` on the root element switches
// the design tokens in globals.css.
const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
const applyColorScheme = () =>
  document.documentElement.classList.toggle('dark', colorScheme.matches);
applyColorScheme();
colorScheme.addEventListener('change', applyColorScheme);

const container = document.getElementById('app');
const root = createRoot(container!);
root.render(<App />);
