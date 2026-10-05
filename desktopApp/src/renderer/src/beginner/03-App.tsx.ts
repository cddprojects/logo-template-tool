/**
 * WALKTHROUGH: desktopApp/src/renderer/src/App.tsx (~750 lines)
 * Open App.tsx beside this file. Line numbers below match the current source.
 *
 * App is the WINDOW FRAME. It does not draw logos. It:
 *   • loads the version list (via useVersions)
 *   • shows Sidebar + LogoEditor / FaviconEditor
 *   • wires undo, export, drag-drop, toasts
 *
 * ── Lines 1–16: file header comment ─────────────────────────────────────────
 * Explains the frame idea. window.api comes from Electron preload OR web polyfill.
 *
 * ── Lines 18–33: imports ────────────────────────────────────────────────────
 * React hooks: useState (remember values), useEffect (run after paint),
 *   useCallback (stable function), useRef (box that survives re-renders),
 *   Component + Suspense (class error boundary + lazy loading)
 * Icons, TitleBar, Sidebar, modals — UI pieces
 * useVersions — the “database” hook
 * types — Version, LogoConfig, …
 * fontLoader, templateFile, imageFit, lazyWithRetry, horizontalWheelScroll — helpers
 *
 * ── Lines 35–38: lazy editors ───────────────────────────────────────────────
 * LogoEditor / FaviconEditor are BIG. lazyWithRetry() means: don’t download/
 * parse that code until someone needs the editor. Faster first paint.
 * .then(m => ({ default: m.LogoEditor })) — adapt named export to React.lazy shape.
 *
 * ── Line 40: type Tab = 'logo' | 'favicon' ──────────────────────────────────
 * Which center tab is selected. Only two allowed strings.
 *
 * ── Lines 42–55: declare global Window.api ──────────────────────────────────
 * Tell TypeScript “window.api exists and has these methods”.
 * The real implementation is elsewhere (preload or web api.ts).
 *
 * ── Lines 57–103: EditorErrorBoundary ───────────────────────────────────────
 * A CLASS component (rare in this app). If a child throws while rendering,
 * React calls getDerivedStateFromError → we show “Rendering error” + Retry
 * instead of a white screen. On web, also detects stale Vite chunks after deploy.
 *
 * ── Line 105: export default function App() ─────────────────────────────────
 * THE root component. Everything below is “what App remembers + what it draws”.
 *
 * ── Lines 106–115: toasts ───────────────────────────────────────────────────
 * useState(null) — toast message or nothing
 * useRef for a timer — so we can cancel the previous auto-hide
 * showToast(msg, type) — set toast, clear after durationMs
 * useCallback(…, []) — function identity stays the same every render
 *
 * ── Lines 117–126: useVersions({ onPersistError }) ──────────────────────────
 * Pull out: versions list, loaded flag, create/import/update/delete,
 * undo/redo, history panel data.
 * If save fails, call showToast with the error.
 *
 * ── Lines 128–129: selectedId ───────────────────────────────────────────────
 * Which sidebar project is open. null = none yet.
 *
 * ── Lines 131–138: useEffect when loaded ────────────────────────────────────
 * After versions finish loading: select first if none selected; start fonts.
 * Dependency [loaded] — run when loaded flips to true.
 *
 * ── Lines 140–145: selection repair ─────────────────────────────────────────
 * If undo deleted the selected version, pick another (or null).
 *
 * ── Lines 147–162: Ctrl+Z / Ctrl+Y ──────────────────────────────────────────
 * Listen to window keydown. preventDefault so the browser doesn’t undo typing
 * in weird places. Cleanup: remove listener when App unmounts or undo/redo change.
 *
 * ── Lines 164–165: horizontal wheel scroll ──────────────────────────────────
 * Install helper once so Shift-less wheel can scroll paint toolbars sideways.
 *
 * ── Lines 167–231: local HTTP render bridge ─────────────────────────────────
 * Desktop main process may ask the UI to render a logo/favicon (canvas only
 * exists in the browser). onApiRenderRequest → import renderer → draw →
 * sendApiRenderResponse with PNG/SVG/ICO data. Empty deps [] = register once.
 *
 * ── Lines 232–243: chrome state ─────────────────────────────────────────────
 * activeTab, modals open/closed, isWebApp flag (__WEB__), group export busy.
 *
 * ── Lines 245–364: handleGroupExport ────────────────────────────────────────
 * User picks formats → for each logo/favicon variant → render to canvas or SVG
 * → collect { filename, dataUrl } → window.api.exportGroup (folder or zip).
 * Uses selectedRef so the callback doesn’t recreate every slider tick.
 *
 * ── Lines 366–370: open-ai-settings event ───────────────────────────────────
 * Other code can dispatch a custom event; App opens Settings modal.
 *
 * ── Lines 372–378: selected + selectedRef ───────────────────────────────────
 * selected = versions.find(id) — the Version object for the UI
 * selectedRef.current = selected — always-fresh pointer for stable callbacks
 *
 * ── Lines 380–414: create / edit / delete / duplicate ───────────────────────
 * Thin wrappers: call useVersions helpers, update selectedId, close modals.
 *
 * ── Lines 416–444: drag-drop .igtemplate ────────────────────────────────────
 * DragOver shows overlay; Drop parses JSON → importTemplateVersion → select it.
 *
 * ── Lines 446–458: import image file ────────────────────────────────────────
 * Hidden <input type="file"> click → read as data URL → importImageVersion.
 *
 * ── Lines 460–471: handleLogosChange / handleFaviconsChange ─────────────────
 * Editors call these when any control changes.
 * updateVersion(selected.id, { logos }) or { favicons }.
 * Stable via selectedRef + useCallback([updateVersion]).
 *
 * ── Lines 473+: return ( … JSX … ) ──────────────────────────────────────────
 * The actual screen tree:
 *   TitleBar
 *   if !loaded → spinner
 *   else → flex row:
 *     Sidebar (list, select, CRUD)
 *     main column:
 *       tabs Logo | Favicon, undo/redo, history, export, settings
 *       BOTH editors mounted; inactive one has CSS display:none / hidden
 *         (so switching tabs does NOT destroy canvas/paint state)
 *       wrapped in EditorErrorBoundary + Suspense (loading fallback)
 *   toast banner if toast != null
 *   modals (create, settings, group export, history, …) when flags true
 *
 * ── Lines 713+: Tab + EmptyState helpers ────────────────────────────────────
 * Small presentational components used only in App’s JSX.
 *
 * Mental model:
 *   App = traffic control. Sidebar picks a version. Editors edit arrays.
 *   useVersions saves. renderer (not App) draws pixels.
 *
 * Next: 04-useVersions.ts.ts
 */
export {}
