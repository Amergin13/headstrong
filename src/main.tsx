import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { runStorageMigrations } from './services/storage';

// Upgrade saved data from older versions before the app reads it.
runStorageMigrations();

// Register PWA service worker with immediate auto-update (skipped in local test copy).
if (import.meta.env.VITE_LOCAL_TEST_COPY !== 'true') {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
    onOfflineReady() {
      console.log('Treise is ready to work offline.');
    },
  });
}

const mountApp = async () => {
  if (import.meta.env.VITE_LOCAL_TEST_COPY === 'true') {
    const { maybeApplyScenarioFromUrl } = await import('./localTest/testScenarios');
    maybeApplyScenarioFromUrl();
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

void mountApp();
