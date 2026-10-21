import '@/assets/globals.css';
import { createRoot } from 'react-dom/client';
import Popup from './Popup';
import { followSystemColorScheme } from '@/utils/color-scheme';

followSystemColorScheme();

const container = document.getElementById('app-container');
const root = createRoot(container!);
root.render(<Popup />);
