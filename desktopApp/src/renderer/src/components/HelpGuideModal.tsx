import React, { useEffect, useState } from 'react'
import { X, HelpCircle } from './Icons'

interface HelpGuideModalProps {
  onClose: () => void
}

type HelpTab = 'use' | 'setup'

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-text uppercase tracking-wider">{title}</h3>
      {children}
    </section>
  )
}

function Kbd({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface3 border border-border text-[10px] font-mono text-text whitespace-nowrap">
      {children}
    </kbd>
  )
}

function ShortcutRow({ keys, desc }: { keys: React.ReactNode; desc: string }): JSX.Element {
  return (
    <div className="flex items-start gap-3 text-[11px]">
      <div className="w-[9.5rem] shrink-0 flex flex-wrap gap-1">{keys}</div>
      <p className="text-muted leading-relaxed pt-0.5">{desc}</p>
    </div>
  )
}

function UseGuide(): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="Overview">
        <p>
          Create and export <span className="text-text">logo</span> and <span className="text-text">favicon</span> artwork
          per version. Pick a version in the left sidebar, edit on the Logo or Favicon tab, then export PNGs (or SVG / ICO from the editor).
        </p>
      </Section>

      <Section title="Versions">
        <ul className="list-disc pl-4 space-y-1.5">
          <li><span className="text-text">+</span> — create a new version</li>
          <li><span className="text-text">Upload</span> — import an existing image as a new editable version</li>
          <li>Hover a version for duplicate, save template, delete; drag the grip to reorder</li>
          <li>Use the top bar to export the selected version, open history, or undo/redo global edits. Undo history is kept when you close and reopen the app (desktop file + web workspace)</li>
        </ul>
      </Section>

      <Section title="Logo & favicon">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>
            Each version can have multiple <span className="text-text">variants</span> (labels, copy style, reorder).
            An empty variant name exports as <span className="text-text font-mono text-[11px]">logo.png</span> /
            <span className="text-text font-mono text-[11px]">favicon.png</span> (no trailing dash)
          </li>
          <li>
            Single export <span className="text-text">Name</span> toggle:
            <span className="text-text">Full</span> → <span className="text-text font-mono text-[11px]">version-logo-…</span> /
            <span className="text-text font-mono text-[11px]">version-favicon-512-…</span>;
            <span className="text-text">Group</span> → same as group export
            (<span className="text-text font-mono text-[11px]">logo.png</span> / <span className="text-text font-mono text-[11px]">logo-dark.png</span>)
          </li>
          <li>Adjust text, colours, layout, container, and icon from the side panels</li>
          <li>
            Outer shape categories: <span className="text-text">None</span>, <span className="text-text">Shapes</span>
            (circle, square, triangle, diamond, pentagon, hexagon, star, map-pin, shield, badge),
            <span className="text-text">Image</span>, or <span className="text-text">SVG</span>
          </li>
          <li>
            Logo ↔ favicon sync needs exact matching variant names. Renaming either side breaks sync but keeps
            the favicon design currently shown by the logo; later favicon changes no longer affect that frozen icon.
            Use <span className="text-text">From favicon</span> / <span className="text-text">From logo</span> to copy while unsynced
          </li>
          <li>
            <span className="text-text">Apply favicon to all</span> / <span className="text-text">Apply icon to all</span> copy
            the active variant’s favicon or logo icon to every other variant (one-time copy, not live sync).
            Synced logo icons copy through the favicon; unsynced logos copy their own custom icon
          </li>
          <li>
            <span className="text-text">Apply inner to all</span> copies the active variant’s inner shape,
            type, size, position, and paint geometry (recoloured to each target’s palette). Each variant
            keeps its outer shape and Outer paint.{' '}
            <span className="text-text">Inner settings (keep colors)</span> copies type/shape/size only —
            each variant keeps its own colours and paint edits
          </li>
          <li>
            <span className="text-text">Paint</span> opens the icon editor. The right panel’s
            <span className="text-text"> Save to variants</span> list chooses which Logo / Favicon variants receive Save
            (a one-time copy, not continuous sync between variants). Saving onto a synced pair
            unlinks them and replaces the logo’s stored original icon with the painted result
          </li>
          <li>
            Preview canvas: stage colour swatch (preview only), <span className="text-text">Default</span> (fit),
            <span className="text-text">Zoom in / out</span> (bottom-right),
            <Kbd>Ctrl</Kbd>+scroll to zoom, middle-click drag to pan
          </li>
        </ul>
      </Section>

      <Section title="Paint editor">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>
            Base layers: <span className="text-text">Outer shape</span> and <span className="text-text">Inner content</span>.
            Icons, shapes, lines, text, and fills are independent object layers. Checkboxes control visibility only;
            border colour marks selection. Hold <Kbd>Ctrl</Kbd> to multi-select. Selecting a layer switches to Pointer
          </li>
          <li>
            Drag layers above / below to reorder. Drop on a group’s centre to nest (including across Inner / Outer).
            Groups expand / collapse with the chevron; group bounds follow children; groups have a rotate pin
          </li>
          <li>
            Move / resize / rotate objects only in <span className="text-text">Pointer</span> mode.
            Hold <Kbd>Shift</Kbd> while dragging a corner to keep aspect ratio.
            <span className="text-text">Keep stroke on resize</span> keeps icon / shape line width constant
          </li>
          <li>
            Brush / eraser paint the top checked base layer, or a selected shape / group.
            <span className="text-text">Fill</span> recolors strokes or fills enclosed empty space on checked base layers
            and on selected / clicked icons — it edits in place and does not add a new layer
          </li>
          <li>
            Brush tips: round, square, calligraphy (/ and \), spray. Eraser shape: circle or square.
            While holding the eraser button, arrows nudge the tip 1px (Shift = 10px)
          </li>
          <li>
            <span className="text-text">Text</span> — click to place and type; drag to move; double-click to re-edit;
            <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>Enter</Kbd> / <Kbd>Esc</Kbd> finishes (switches to Pointer)
          </li>
          <li>
            <span className="text-text">Marquee</span> is a temporary edit: Coverage adjusts the box; Scale content
            stretches pixels. Clicking outside commits changes back into the original layers (no new object layer)
          </li>
          <li>Colour swatch supports Solid / Linear / Radial. Gradients apply to shapes, lines, and text; brush and fill use the first stop</li>
          <li><span className="text-text">Lock aspect ratio</span> keeps polygons / irregular shapes square while drawing or resizing</li>
          <li><span className="text-text">Rotate / flip</span> turns or mirrors the whole paint canvas — 90° CW / CCW, 180°, flip H / V</li>
          <li><span className="text-text">Remove BG</span> clears a solid background on checked base layers (corner flood-fill)</li>
          <li>
            <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> or Save writes a flattened image plus an editable session to the chosen variants.
            Settings update to match the painted image (size, offset, colours). Later outside changes update the preview
            and invalidate the old session, so reopening Paint rebakes from the current settings
          </li>
          <li>Esc closes without saving after clearing selection / finishing edits</li>
        </ul>
      </Section>

      <Section title="Shortcuts — app">
        <div className="space-y-2">
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>Z</Kbd></>} desc="Undo version / config changes" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>Y</Kbd></>} desc="Redo" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>Z</Kbd></>} desc="Redo (alternate)" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd>+scroll</>} desc="Zoom logo / favicon preview (also paint canvas)" />
        </div>
      </Section>

      <Section title="Shortcuts — paint editor">
        <div className="space-y-2">
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>S</Kbd></>} desc="Save paint to the selected variants" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>Z</Kbd></>} desc="Undo paint action" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>Y</Kbd></>} desc="Redo paint action" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>C</Kbd></>} desc="Copy selection or selected item" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>X</Kbd></>} desc="Cut selection" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd><Kbd>V</Kbd></>} desc="Paste" />
          <ShortcutRow keys={<><Kbd>←</Kbd><Kbd>→</Kbd><Kbd>↑</Kbd><Kbd>↓</Kbd></>} desc="Nudge selected item (or marquee / floating selection) by 1px" />
          <ShortcutRow keys={<><Kbd>Shift</Kbd><Kbd>←</Kbd><Kbd>→</Kbd><Kbd>↑</Kbd><Kbd>↓</Kbd></>} desc="Nudge by 10px" />
          <ShortcutRow keys={<><Kbd>Shift</Kbd>+corner drag</>} desc="Keep aspect ratio while resizing" />
          <ShortcutRow keys={<><Kbd>Ctrl</Kbd>+click layer</>} desc="Multi-select layers in the Layers panel" />
          <ShortcutRow keys={<><Kbd>Del</Kbd></>} desc="Delete selected item, clear marquee region, or discard floating selection" />
          <ShortcutRow keys={<><Kbd>Enter</Kbd></>} desc="Commit floating selection / clear marquee; finish click-to-place polygon; finish typing text" />
          <ShortcutRow keys={<><Kbd>Shift</Kbd><Kbd>Enter</Kbd></>} desc="New line while typing text on the canvas" />
          <ShortcutRow keys={<><Kbd>Esc</Kbd></>} desc="Cancel selection / float, finish text edit, or close the paint editor" />
        </div>
      </Section>

      <Section title="Tips">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Double-click the title bar to maximize / restore the window</li>
          <li>See the <span className="text-text">Setup</span> tab for API keys, templates, and other one-time configuration</li>
        </ul>
      </Section>
    </div>
  )
}

function SetupGuide(): JSX.Element {
  return (
    <div className="space-y-5">
      <Section title="Where to configure">
        <p>
          Open <span className="text-text">Settings</span> from the gear icon in the top bar
          (labelled “AI Settings”). Keys are stored on this computer only.
        </p>
      </Section>

      <Section title="Google Gemini API key">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>
            Used by the icon picker’s <span className="text-text">AI</span> tab to turn a description into several
            alternate search concepts, then search Iconify (style locks cover outline, colored, and vector packs
            such as Lucide, Tabler, Line Awesome, Streamline, Game Icons, and more)
          </li>
          <li>Next page keeps the same keyword and digs deeper across packs; alternate concepts are only used after that keyword runs dry. Without a key, a local keyword fallback is used</li>
          <li>
            Get a free key at{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:text-accent-hover"
            >
              Google AI Studio
            </a>
            , paste it in Settings, then Save
          </li>
          <li>Key format typically starts with <span className="text-text font-mono text-[11px]">AIza…</span></li>
        </ul>
      </Section>

      <Section title="Image generation">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Raster AI image generation uses <span className="text-text">Pollinations.ai</span> (FLUX) — no account or API key required</li>
          <li>No setup step for that path; network access is required when you use it</li>
        </ul>
      </Section>

      <Section title="Templates">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Hover a version → <span className="text-text">save as template</span> to reuse its logo / favicon setup later</li>
          <li>Open the templates folder from the sidebar button to add or manage <span className="text-text">.igtemplate</span> files</li>
          <li>Dropping a template file into that folder imports it automatically while the app is running</li>
        </ul>
      </Section>

      <Section title="Fonts">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Logo / favicon font families load from <span className="text-text">Google Fonts</span> when selected</li>
          <li>First use of a family needs network access; after that it is cached for the session</li>
        </ul>
      </Section>

      <Section title="Icon credits">
        <p>
          Abstract 001–121 are from{' '}
          <a
            href="https://game-icons.net/"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-hover"
          >
            Game Icons
          </a>
          , provided through{' '}
          <a
            href="https://iconify.design/"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-hover"
          >
            Iconify
          </a>
          {' '}and licensed under{' '}
          <a
            href="https://creativecommons.org/licenses/by/3.0/"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-hover"
          >
            CC BY 3.0
          </a>
          .
        </p>
      </Section>

      <Section title="Data & saves">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Versions and settings live under the app’s local <span className="text-text">data</span> folder (next to the portable exe, or inside the project in dev)</li>
          <li>Keep that folder when moving or updating the app so your versions and templates stay intact</li>
        </ul>
      </Section>

      <Section title="HTTP API (optional)">
        <ul className="list-disc pl-4 space-y-1.5">
          <li>
            While the app window is open: <span className="text-text font-mono text-[11px]">http://127.0.0.1:3847</span>
            {' '}(<span className="text-text font-mono text-[11px]">GET /</span> lists all endpoints)
          </li>
          <li>
            <span className="text-text font-mono text-[11px]">GET /versions</span> — list versions;
            <span className="text-text font-mono text-[11px]"> GET /versions/:idOrName</span> — full JSON
          </li>
          <li>
            <span className="text-text font-mono text-[11px]">PATCH /versions/:idOrName</span> — update text fields
            (<span className="text-text font-mono text-[11px]">faviconText</span>,{' '}
            <span className="text-text font-mono text-[11px]">logoTitle</span>,{' '}
            <span className="text-text font-mono text-[11px]">logoSubtitle</span>; optional{' '}
            <span className="text-text font-mono text-[11px]">variantLabel</span>)
          </li>
          <li>
            <span className="text-text font-mono text-[11px]">POST …/favicon/export</span> — PNG / SVG / ICO;
            <span className="text-text font-mono text-[11px]"> POST …/logo/export</span> — PNG / SVG.
            App window must be open; responses include base64 <span className="text-text font-mono text-[11px]">data</span>
          </li>
        </ul>
      </Section>
    </div>
  )
}

export function HelpGuideModal({ onClose }: HelpGuideModalProps): JSX.Element {
  const [tab, setTab] = useState<HelpTab>('use')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg mx-4 max-h-[min(88vh,720px)] flex flex-col bg-surface2 border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">Help</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 px-5 pt-3 shrink-0">
          {([
            { id: 'use' as const, label: 'How to use' },
            { id: 'setup' as const, label: 'Setup' }
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                tab === t.id
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'text-muted hover:text-text hover:bg-surface3 border border-transparent'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 overflow-y-auto text-[12px] text-muted leading-relaxed">
          {tab === 'use' ? <UseGuide /> : <SetupGuide />}
        </div>
      </div>
    </div>
  )
}
