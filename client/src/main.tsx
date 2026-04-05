/**
 * FundLens v6 — React Entry Point
 *
 * Mounts the App component and injects global CSS (dark theme,
 * CSS reset, font setup).
 *
 * Session 8 deliverable. Destination: client/src/main.tsx
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { cssVars } from './theme';

// ─── Global Styles ─────────────────────────────────────────────────────────
// Injected via a <style> tag so we don't need a separate CSS file.

const globalCSS = `
  ${cssVars}

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body, #root {
    height: 100%;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  /* Scrollbar styling for dark theme */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--border-light);
  }

  /* Input focus styles */
  input:focus, select:focus, textarea:focus {
    border-color: var(--accent) !important;
    outline: none;
  }

  /* Spinner animation (used by loading states) */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Range input styling */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    outline: none;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: 2px solid var(--bg);
  }

  input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: 2px solid var(--bg);
  }
`;

// Inject global styles
const styleEl = document.createElement('style');
styleEl.textContent = globalCSS;
document.head.appendChild(styleEl);

// ─── Mount React ───────────────────────────────────────────────────────────

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
