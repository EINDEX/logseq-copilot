import { createRoot } from 'react-dom/client';
import Options from './Options';
import './index.scss';
import { ChakraProvider } from '@chakra-ui/react';

const container = document.getElementById('app-container');
const root = createRoot(container!);
root.render(
  <ChakraProvider>
    <Options />
  </ChakraProvider>,
);
