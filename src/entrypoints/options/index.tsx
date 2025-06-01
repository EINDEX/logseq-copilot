import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@/assets/globals.css';
import App from './App';

const container = document.getElementById('app');
const root = createRoot(container!);
root.render(
  <HashRouter>
    <App />
  </HashRouter>
);
