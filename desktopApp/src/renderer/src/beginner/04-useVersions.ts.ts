/**
 * WALKTHROUGH: desktopApp/src/renderer/src/hooks/useVersions.ts (~955 lines)
 * Open that file beside this. This is the app’s “database in memory”.
 *
 * A React HOOK is a function starting with use… that you call inside a
 * component. useVersions() returns { versions, updateVersion, undo, … }.
 *
 * ── Lines 1–19: file header ─────────────────────────────────────────────────
 * Load, save (debounced), undo/redo, CRUD, migrate. Desktop → versions.json;
 * web → server workspace PUT.
 *
 * ── Lines 22–32: constants + isWebRuntime ───────────────────────────────────
 * MAX_HISTORY = 50 undo steps kept in memory.
 * MAX_PERSISTED_HISTORY_WEB = 0 — web does NOT save undo snaps to the server
 *   (they contain huge paint PNGs and timed out). Undo still works in the tab.
 * isWebRuntime() — true when window.__WEB__ is set (webApp installWebApi).
 *
 * ── Lines 33–43: imports ────────────────────────────────────────────────────
 * Types + DEFAULT_* for new blank variants.
 * versionFromIgTemplate — parse .igtemplate JSON into a Version.
 * migrateVersion — fill missing fields on old saves (never strip paint flags).
 *
 * ── Lines 45–57: Snap / HistoryEntry / PersistedUndoHistory ─────────────────
 * Snap = full copy of all versions + label + time (one undo point).
 * HistoryEntry = what the History panel lists (label + time only).
 * PersistedUndoHistory = shape written to undo-history.json (desktop).
 *
 * ── Lines 59–≈275: summarize* helpers ───────────────────────────────────────
 * When you change a slider, we invent a human label like “Logo text color”
 * by comparing previous vs next config. You can skim these; they only feed
 * the History panel names.
 *
 * ── Lines 277–≈365: factories + migrate parse ───────────────────────────────
 * makeLogoVariant / makeFaviconVariant — blank Dark-style variants for “New”.
 * uniqueVersionName / disambiguateVersionNames — avoid duplicate sidebar names.
 * migrateSnap / parsePersistedHistory — load old undo files safely.
 *
 * ── Line 367: export function useVersions(options?) ─────────────────────────
 * THE hook App calls. Everything below lives inside this function.
 *
 * ── Lines 370–384: core state + refs ────────────────────────────────────────
 * versions / setVersionsState — the live list React re-renders from
 * loaded — false until first load finishes (App shows spinner)
 * saveTimer — debounce disk/network writes (~400ms after last edit)
 * serverHydratedRef — web: don’t save empty before server load succeeds
 * dirtySinceHydrateRef — web: ignore stale reload if user already edited
 * versionsRef.current = versions — ALWAYS the latest list for stable callbacks
 *
 * Why refs? If updateVersion closed over `versions` from render #5, by the
 * time a slider fires you might write stale data. Ref always points at latest.
 *
 * ── Lines 386–438: undo timeline ────────────────────────────────────────────
 * pastRef | current (versionsRef) | futureRef
 * refreshMeta() — rebuild History panel list for the UI
 * serializeHistory / applyHistory — save/restore timeline
 * Web applyHistory clears past/future on load (fresh in-tab undo only)
 *
 * ── Lines 440–458: flushPersist ─────────────────────────────────────────────
 * Cancel debounce timer; immediately window.api.saveVersions(…).
 * Used on tab hide / structural commits on web.
 *
 * ── Lines 460–581: mount useEffect (LOAD) ───────────────────────────────────
 * On first mount:
 *   1. window.api.loadVersions() → migrateVersion each → set state
 *   2. loadUndoHistory() → applyHistory (desktop)
 *   3. onTemplateImported — desktop dropped a template into templates/
 *   4. onVersionsReloaded — web server pushed a fresh workspace
 *   5. pagehide / visibilitychange → flushPersist (don’t lose work)
 * Cleanup on unmount: cancel timers, final save.
 *
 * ── Lines 583–600: persist (debounced save) ─────────────────────────────────
 * Mark dirty; wait 400ms; save versionsRef.current + history.
 * Slider spam → one write, not 60 per second.
 *
 * ── Lines 602–609: save(next) ───────────────────────────────────────────────
 * Update ref + React state + schedule persist. Pure “write this new list”.
 *
 * ── Lines 611–628: commit(newState, actionLabel) ────────────────────────────
 * Structural actions (create, delete, rename…):
 *   push current into pastRef, clear future, set new label, save.
 * Web: flushPersist immediately so refresh can’t beat the 400ms timer.
 *
 * ── Lines 635+: CRUD ────────────────────────────────────────────────────────
 * createVersion — new id, one logo + one favicon variant, commit
 * importImageVersion — seed from uploaded PNG/SVG data URL
 * importTemplateVersion — from .igtemplate JSON
 * upgradeVersionsToCurrentSchema — remigrate everything (Update-all templates)
 * updateVersion(id, patch, label?) — merge fields; debounce history label for
 *   rapid slider changes; commit-style for bigger edits
 * deleteVersion(s) / duplicateVersion / reorderVersions
 *
 * ── Lines 877+: undo / redo / jumpTo ────────────────────────────────────────
 * Move snapshots between past/future and call save().
 * canUndo / canRedo / undoLabel — for toolbar buttons.
 *
 * ── Return object (end of function) ─────────────────────────────────────────
 * Everything App destructures. That is the public API of this hook.
 *
 * Flow to remember:
 *   Editor onChange → App handleLogosChange → updateVersion
 *     → save → persist (400ms) → window.api.saveVersions
 *
 * Next: 05-LogoEditor.ts
 */
export {}
