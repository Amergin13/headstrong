import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { runStorageMigrations } from './services/storage';

// Upgrade saved data from older versions before the app reads it.
runStorageMigrations();

// Register PWA service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New version available. Refresh?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('Treise is ready to work offline.');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
