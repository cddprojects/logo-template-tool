import React, { useEffect, useState } from 'react'
import { X, Download, AlertTriangle } from './Icons'

interface DownloadDesktopModalProps {
  onClose: () => void
}

const EXE_PATH = 'downloads/Image-Generator.exe'

function encodePowerShellCommand(script: string): string {
  // -EncodedCommand expects UTF-16LE base64
  const bytes = new Uint8Array(script.length * 2)
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    bytes[i * 2] = c & 0xff
    bytes[i * 2 + 1] = (c >> 8) & 0xff
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function buildInstallerScript(opts: {
  exeUrl: string
  desktop: boolean
  startMenu: boolean
  taskbar: boolean
}): string {
  const { exeUrl, desktop, startMenu, taskbar } = opts
  return `
$ErrorActionPreference = 'Stop'
$ExeUrl = '${exeUrl.replace(/'/g, "''")}'
$AppName = 'Image Generator'
$InstallDir = Join-Path $env:LOCALAPPDATA $AppName
$ExePath = Join-Path $InstallDir 'Image Generator.exe'

Write-Host ''
Write-Host "Installing $AppName..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Host 'Downloading latest desktop build...'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $ExeUrl -OutFile $ExePath -UseBasicParsing

if (-not (Test-Path $ExePath)) { throw 'Download failed — exe missing after transfer.' }

$Wsh = New-Object -ComObject WScript.Shell

function New-AppShortcut([string]$LinkPath) {
  $shortcut = $Wsh.CreateShortcut($LinkPath)
  $shortcut.TargetPath = $ExePath
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.Description = $AppName
  $shortcut.Save()
  Write-Host "  Created: $LinkPath" -ForegroundColor Green
}

${desktop ? `
$desktopPath = Join-Path ([Environment]::GetFolderPath('Desktop')) ($AppName + '.lnk')
New-AppShortcut $desktopPath
` : '#'}

${startMenu ? `
$startDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'
New-Item -ItemType Directory -Force -Path $startDir | Out-Null
$startPath = Join-Path $startDir ($AppName + '.lnk')
New-AppShortcut $startPath
` : '#'}

${taskbar ? `
# Best-effort taskbar pin (works on some Windows builds; Win11 may ignore it).
$taskbarDir = Join-Path $env:APPDATA 'Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar'
New-Item -ItemType Directory -Force -Path $taskbarDir | Out-Null
$taskbarLnk = Join-Path $taskbarDir ($AppName + '.lnk')
New-AppShortcut $taskbarLnk
try {
  $shell = New-Object -ComObject Shell.Application
  $folder = $shell.Namespace($InstallDir)
  if ($folder) {
    $item = $folder.ParseName('Image Generator.exe')
    if ($item) { $item.InvokeVerb('taskbarpin') }
  }
} catch {}
Write-Host '  Taskbar: if the icon is not pinned, right-click the app → Pin to taskbar.' -ForegroundColor Yellow
` : '#'}

Write-Host ''
Write-Host "Installed to: $ExePath" -ForegroundColor Cyan
Write-Host 'Launching app...'
Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
Write-Host 'Done.' -ForegroundColor Green
`.trim()
}

function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function DownloadDesktopModal({ onClose }: DownloadDesktopModalProps): JSX.Element {
  const [desktop, setDesktop] = useState(true)
  const [startMenu, setStartMenu] = useState(true)
  const [taskbar, setTaskbar] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exeReady, setExeReady] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`./${EXE_PATH}`, { method: 'HEAD', cache: 'no-store' })
        if (!cancelled) setExeReady(res.ok)
      } catch {
        if (!cancelled) setExeReady(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleDownload = async () => {
    setError(null)
    setBusy(true)
    try {
      const exeUrl = new URL(`./${EXE_PATH}`, window.location.href).href
      const probe = await fetch(exeUrl, { method: 'HEAD', cache: 'no-store' })
      if (!probe.ok) {
        throw new Error(
          'Desktop build not found. Run a desktop build and sync it first (npm run sync:desktop in webApp).'
        )
      }

      const script = buildInstallerScript({
        exeUrl,
        desktop,
        startMenu,
        taskbar
      })
      const encoded = encodePowerShellCommand(script)
      const cmd = [
        '@echo off',
        'title Install Image Generator',
        'echo.',
        'echo Downloading Image Generator and creating shortcuts...',
        'echo.',
        `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`,
        'if errorlevel 1 (',
        '  echo.',
        '  echo Install failed. If Windows blocked the script, right-click this file → Run as administrator,',
        '  echo or open PowerShell and run: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned',
        '  echo.',
        '  pause',
        '  exit /b 1',
        ')',
        'echo.',
        'pause'
      ].join('\r\n')

      downloadTextFile(cmd, 'Install-Image-Generator.cmd', 'application/x-bat')
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 bg-surface2 border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Download size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">Download desktop app</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface3 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            Downloads a small installer that fetches the latest Windows build and creates shortcuts
            where you choose. Double-click the downloaded <span className="text-text">.cmd</span> file to finish setup.
          </p>

          {exeReady === false && (
            <div className="flex gap-2 items-start rounded-lg border border-yellow-800/60 bg-yellow-950/40 px-3 py-2">
              <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-yellow-200/90 leading-relaxed">
                No desktop <span className="font-mono">.exe</span> is available to the web server yet.
                From <span className="font-mono">webApp</span>, run{' '}
                <span className="font-mono">npm run sync:desktop</span> after building the desktop app.
              </p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-text-dim mb-2">Create shortcuts on</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={desktop}
                  onChange={(e) => setDesktop(e.target.checked)}
                  className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                />
                Desktop
              </label>
              <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={startMenu}
                  onChange={(e) => setStartMenu(e.target.checked)}
                  className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                />
                Start menu
              </label>
              <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskbar}
                  onChange={(e) => setTaskbar(e.target.checked)}
                  className="rounded border-border bg-surface3 text-accent focus:ring-accent"
                />
                Taskbar
                <span className="text-[10px] text-muted">(best effort — Windows may require Pin manually)</span>
              </label>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-300 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {done && (
            <p className="text-xs text-green-300 bg-green-950/40 border border-green-900 rounded-lg px-3 py-2">
              Installer downloaded. Open <span className="font-mono">Install-Image-Generator.cmd</span> from your
              Downloads folder to install the app and create shortcuts.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-text hover:bg-surface3 transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            disabled={busy || exeReady === false}
            onClick={() => { void handleDownload() }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Download size={12} />
            {busy ? 'Preparing…' : 'Download installer'}
          </button>
        </div>
      </div>
    </div>
  )
}
