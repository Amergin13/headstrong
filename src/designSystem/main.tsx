import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { DesignSystemApp } from './DesignSystemApp';

document.documentElement.classList.add('ds-live');
document.getElementById('design-system-snapshot-css')?.remove();
document.getElementById('design-system-live-tokens-link')?.remove();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesignSystemApp />
  </React.StrictMode>
);
