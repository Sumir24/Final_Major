import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';


const resizeObserverLoopErr = 'ResizeObserver loop completed with undelivered notifications';

// Patch console.error to filter out this specific error
const originalError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes(resizeObserverLoopErr) || args[0].includes('ResizeObserver loop limit exceeded'))
  ) {
    return;
  }
  originalError.call(console, ...args);
};

// Global error handler with capture phase (true) to intercept before others
window.addEventListener('error', (e) => {
  if (
    e.message &&
    (e.message.includes(resizeObserverLoopErr) || e.message.includes('ResizeObserver loop limit exceeded'))
  ) {
    e.stopImmediatePropagation();
    e.preventDefault(); // Prevent browser console log if possible
  }
}, true);

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
