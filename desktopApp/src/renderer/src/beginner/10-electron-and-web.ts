/**
 * WALKTHROUGH: desktop shell vs web shell
 *
 * Same React editors. Different “operating system” around them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESKTOP (Electron)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three processes / scripts:
 *
 * 1) MAIN — desktopApp/src/main/index.ts
 *    Runs in Node.js. Can read/write files. Creates the BrowserWindow.
 *    Owns dataDir:
 *      Dev  → <project>/data/
 *      Prod → %APPDATA%/Image Generator/data/
 *    Files: versions.json, undo-history.json, templates/, .template-registry.json
 *    ipcMain.handle('load-versions', …) etc. — answers renderer requests
 *    Watches templates/ — new .igtemplate → migrate → send 'template-imported'
 *    Optional local HTTP API — asks renderer to canvas-render (App.tsx bridge)
 *
 * 2) PRELOAD — desktopApp/src/preload/index.ts
 *    Runs before the page. contextBridge.exposeInMainWorld('api', { … })
 *    Each method ≈ ipcRenderer.invoke('channel', args)
 *    Renderer ONLY sees window.api — not raw Node fs (security).
 *
 * 3) RENDERER — desktopApp/src/renderer/src/*
 *    main.tsx → App.tsx → editors (this beginner course)
 *
 * Boot order:
 *   Electron starts main → creates window with preload → loads HTML
 *   → main.tsx mounts React → useVersions calls window.api.loadVersions
 *   → main reads versions.json → returns JSON → UI fills sidebar
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WEB (Vite + server)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * webApp/src/main.tsx (line-by-line idea):
 *   1. installWebApi() FIRST — invent window.api + window.__WEB__ = true
 *   2. createRoot → <WebShell /> (not bare App)
 *   3. hide splash; handle vite:preloadError (stale chunk after deploy)
 *
 * webApp/src/platform/api.ts:
 *   SAME method names as preload (loadVersions, saveVersions, exportGroup, …)
 *   but implemented with fetch → your backend (auth workspace GET/PUT)
 *   export → browser download / zip
 *   updateAllTemplates → library create/update + migrate orphans
 *
 * webApp/src/components/WebShell.tsx:
 *   fetchMe / LoginScreen if logged out
 *   waitForWorkspace() before mounting <App /> (don’t save empty over server)
 *   Then <App /> from @renderer (alias → desktopApp renderer)
 *   Web-only modals: TemplatesPanel, AdminUsers, TemplateSaveModal
 *
 * webApp/vite.config.ts:
 *   alias @renderer → ../desktopApp/src/renderer/src
 *   That’s why one LogoEditor fix updates both products.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Side-by-side mapping
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Need                         Desktop                    Web
 * ───────────────────────────  ─────────────────────────  ────────────────────
 * window.api                   preload → IPC → main       platform/api.ts
 * Persist versions             versions.json on disk      server workspace PUT
 * Undo history file            undo-history.json          in-tab only (not persisted)
 * Templates folder             watch data/templates       TemplatesPanel + API
 * Login                        none                       WebShell + auth.ts
 * Export folder/zip            dialog + fs                download zip
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Rule for bugfixes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Editor / preview / types / renderer bug → fix under desktopApp/.../renderer
 *   → both platforms after rebuild/redeploy.
 *
 * “Save doesn’t hit disk” → main/preload (desktop) or platform/api + server (web).
 * “Can’t log in” → web only (auth / WebShell).
 *
 * You finished the beginner series. Re-read 00-START-HERE.ts anytime.
 * Short map without teaching pace: ../READING_GUIDE.ts
 */
export {}
