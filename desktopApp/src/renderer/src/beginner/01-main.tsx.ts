/**
 * LINE-BY-LINE: desktopApp/src/renderer/src/main.tsx
 * Open that file next to this one. Numbers match the source (approx).
 *
 * This is the FIRST JavaScript that runs for the desktop UI. Its only job:
 * put the React app on the screen and hide the splash.
 *
 * ── Lines 1–9: file comment ─────────────────────────────────────────────────
 * Explains purpose. Does not run.
 *
 * ── Line 10: import React from 'react' ───────────────────────────────────────
 * Bring in the React library. You need it because JSX (<App />) uses React.
 *
 * ── Line 11: import ReactDOM from 'react-dom/client' ─────────────────────────
 * ReactDOM knows how to attach React to a real HTML page in the browser
 * (Electron’s window is basically Chromium).
 *
 * ── Line 12: import App from './App' ─────────────────────────────────────────
 * Import our big root component from App.tsx in the same folder.
 * Default export → you can name it App when importing.
 *
 * ── Line 13: import './index.css' ────────────────────────────────────────────
 * Load global CSS (colors, fonts, layout utilities). Side-effect import:
 * we don’t use a variable; we just want the styles applied.
 *
 * ── Lines 15–19: createRoot(…).render(…) ────────────────────────────────────
 * document.getElementById('root') — find the empty <div id="root"> in index.html
 * ! — TypeScript “I promise this is not null”
 * createRoot(…) — prepare React to control that div
 * .render(…) — draw this tree into the page:
 *
 *   <React.StrictMode>   ← development helper: runs some checks twice
 *     <App />            ← our whole application UI
 *   </React.StrictMode>
 *
 * After this, React owns the page content inside #root.
 *
 * ── Lines 21–24: hide splash ────────────────────────────────────────────────
 * requestAnimationFrame(fn) — run fn right before the next screen paint.
 * window.__hideSplash — optional function defined in the HTML splash script.
 * ?. — “call it only if it exists” (optional chaining).
 *
 * Why wait one frame? So React has painted something before we remove the
 * loading splash, avoiding a blank flicker.
 *
 * Next: 02-types.ts.ts (what a Version / LogoConfig is).
 */
export {}
