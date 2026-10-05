/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BEGINNER COURSE — start here (no React knowledge assumed)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * These files are COMMENT-ONLY (they export nothing useful). Open them in the
 * editor and read top to bottom. Keep the real source file open beside them.
 *
 * Folder: desktopApp/src/renderer/src/beginner/
 *
 *   00-START-HERE.ts     ← you are here (ideas + vocabulary)
 *   01-main.tsx.ts       ← first real file, every line
 *   02-types.ts.ts       ← data shapes (what a logo “is” in the computer)
 *   03-App.tsx.ts        ← whole window layout
 *   04-useVersions.ts.ts ← saving / loading / undo
 *   05-LogoEditor.ts     ← logo screen
 *   06-FaviconEditor.ts  ← favicon screen
 *   07-PreviewAndCanvas.ts ← pan/zoom + dual canvas (no flash)
 *   08-renderer.ts.ts    ← how pixels get drawn
 *   09-paint.ts          ← Paint mode (big file — guided tour)
 *   10-electron-and-web.ts ← desktop main/preload + web login bridge
 *
 * Also see: ../READING_GUIDE.ts for a short map without the teaching pace.
 *
 * ── What is this app? ───────────────────────────────────────────────────────
 * A tool to design logos (text + icon) and favicons (square site icons).
 * You make many “versions” (like projects). Each version can have variants
 * named Dark / Light / etc.
 *
 * ── What is React? ──────────────────────────────────────────────────────────
 * React is a library for building screens from small pieces called COMPONENTS.
 *
 * Analogy: HTML is like writing a poster by hand. React is like keeping a
 * recipe (“when data changes, redraw these parts”). You describe the UI as
 * functions that return markup (JSX looks like HTML inside JavaScript).
 *
 * Important words:
 *   • Component — a function that returns UI (e.g. App, Sidebar, LogoEditor)
 *   • Props     — inputs passed INTO a component (like function arguments)
 *   • State     — data the component remembers (useState). Change it → screen updates
 *   • Hook      — special function starting with use… (useState, useEffect, …)
 *   • useEffect — “after paint / when X changes, run this side effect”
 *                 (load files, redraw canvas, listen to keyboard, …)
 *   • JSX       — <div>…</div> written in .tsx files; compiles to JS function calls
 *
 * You do NOT need to memorize React. Read the walkthroughs; the patterns repeat.
 *
 * ── What is TypeScript? ─────────────────────────────────────────────────────
 * JavaScript + types. `name: string` means “name must be text”. Types catch
 * mistakes before the app runs. types.ts is a catalog of those shapes.
 *
 * ── What is Electron? ───────────────────────────────────────────────────────
 * A way to wrap a web page as a desktop app.
 *   • Main process (Node.js) — can read/write files, open windows
 *   • Preload — safe bridge exposing window.api
 *   • Renderer — the React UI (this folder)
 *
 * Web build: same React UI, but window.api talks to a server instead of files.
 *
 * ── How data moves (one sentence) ───────────────────────────────────────────
 * You edit controls → React state updates → canvas redraws → save to disk/server.
 *
 * Next file: 01-main.tsx.ts (open ../main.tsx beside it).
 */
export {}
