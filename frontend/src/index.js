import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';


// Patch ResizeObserver to prevent "ResizeObserver loop limit exceeded" or "ResizeObserver loop completed with undelivered notifications."
if (typeof window !== 'undefined' && window.ResizeObserver) {
  // Hide the Webpack dev server overlay if it pops up for this specific error
  window.addEventListener('error', e => {
    if (
      e.message === 'ResizeObserver loop limit exceeded' ||
      e.message === 'ResizeObserver loop completed with undelivered notifications.' ||
      e.message === 'ResizeObserver loop completed with undelivered notifications'
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();

      const overlayDiv = document.getElementById('webpack-dev-server-client-overlay-div');
      const overlay = document.getElementById('webpack-dev-server-client-overlay');
      if (overlay) overlay.setAttribute('style', 'display: none');
      if (overlayDiv) overlayDiv.setAttribute('style', 'display: none');
    }
  });

  // Wrap the callback in requestAnimationFrame to decouple logic from the resize event loop
  const _ResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class ResizeObserver extends _ResizeObserver {
    constructor(callback) {
      super((entries, observer) => {
        window.requestAnimationFrame(() => {
          callback(entries, observer);
        });
      });
    }
  };
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
