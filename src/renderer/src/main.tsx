// src/renderer/src/main.tsx
import '@fontsource-variable/inter';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { installApiBridge } from '~/shims/apiBridge';

import { App } from './App';

// The web's screens call their own server with relative addresses; send those through the main process before anything renders.
installApiBridge();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
