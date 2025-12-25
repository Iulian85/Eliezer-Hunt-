
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

// Folosim manifestul local definit în public/tonconnect-manifest.json
const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>
);
