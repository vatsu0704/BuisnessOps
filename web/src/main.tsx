import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import '@/styles/global.css';
import { i18nReady } from '@/i18n';
import { registerServiceWorker } from '@/utils/serviceWorker';
import App from './App';

// The app kept on this computer, so the counter opens with no connection.
registerServiceWorker();

// The first frame is drawn in the reader's language, not English then theirs.
void i18nReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
});
