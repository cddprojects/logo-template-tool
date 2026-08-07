# Image Generator (Web)

Browser build of the desktop Image Generator. UI and editors are shared from `../desktopApp/src/renderer` — this package only adds a Vite entrypoint and a `window.api` bridge (localStorage, downloads, fetch proxies).

## Setup

```bash
cd webApp
npm install
npm run dev
```

Open http://localhost:5173

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build |
| `npm run sync:desktop` | Copy latest `desktopApp/dist-app/*.exe` → `public/downloads/Image-Generator.exe` |
| `npm run prepare:desktop` | Build Windows portable + sync for web download |

### Desktop download button

The web UI shows a download icon next to Settings. It gives users an installer (`.cmd`) that:

1. Downloads the latest portable `.exe` from `/downloads/Image-Generator.exe`
2. Installs it under `%LOCALAPPDATA%\Image Generator\`
3. Creates shortcuts (Desktop / Start menu / Taskbar — user choice)

In dev, Vite also serves the newest exe directly from `desktopApp/dist-app` if sync has not been run.

## Differences from desktop

| Desktop | Web |
|---------|-----|
| `data/versions.json` | `localStorage` key `imggen:versions` |
| Save dialogs | Browser downloads / directory picker |
| Templates folder | Export downloads `.igtemplate`; “open folder” imports via file picker |
| Local REST API (`:3847`) | Not available |
| Window min/max/close | Hidden |

## Notes

- Do not edit renderer files under `webApp/` — change `desktopApp/src/renderer` and both apps pick them up.
- Fonts are served from `desktopApp/src/renderer/public/fonts`.
