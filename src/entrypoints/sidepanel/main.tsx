import { createRoot } from 'react-dom/client';
import '@/assets/globals.css';
import App from './App';
import { followSystemColorScheme } from '@/utils/color-scheme';
import { followDocumentLanguage, initI18n, watchUiLanguage } from '@/i18n/react';

// This page has no host page to take the theme from (the in-page UI does), so
// it follows the system color scheme, like the options page.
followSystemColorScheme();
void initI18n();
watchUiLanguage();
followDocumentLanguage();

const container = document.getElementById('app');
const root = createRoot(container!);
root.render(<App />);
