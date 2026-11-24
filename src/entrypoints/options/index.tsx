import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@/assets/globals.css';
import App from './App';
import { followSystemColorScheme } from '@/utils/color-scheme';
import { followDocumentLanguage, initI18n, watchUiLanguage } from '@/i18n/react';

followSystemColorScheme();
void initI18n();
watchUiLanguage();
followDocumentLanguage();

const container = document.getElementById('app');
const root = createRoot(container!);
root.render(
  <HashRouter>
    <App />
  </HashRouter>
);
