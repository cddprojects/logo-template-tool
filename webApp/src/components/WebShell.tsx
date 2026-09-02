import React, { useEffect, useState } from 'react'
import App from '@renderer/App'
import type { Version } from '@renderer/types'
import { hideStartupSplash } from '@renderer/utils/lazyWithRetry'
import {
  fetchMe,
  getAuthUser,
  subscribeAuth,
  WEB_OPEN_ADMIN,
  WEB_OPEN_TEMPLATES,
  WEB_SAVE_TEMPLATE,
  type AuthUser
} from '../platform/auth'
import { waitForWorkspace } from '../platform/api'
import { LoginScreen } from './LoginScreen'
import { AdminUsersModal } from './AdminUsersModal'
import { TemplateSaveModal } from './TemplateSaveModal'
import { TemplatesPanel } from './TemplatesPanel'

export function WebShell(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [saveVersion, setSaveVersion] = useState<Version | null>(null)

  useEffect(() => {
    hideStartupSplash()
    const unsub = subscribeAuth(setUser)
    const bootTimeout = window.setTimeout(() => setReady(true), 9000)
    void fetchMe().finally(() => {
      window.clearTimeout(bootTimeout)
      setReady(true)
    })
    return () => {
      window.clearTimeout(bootTimeout)
      unsub()
    }
  }, [])

  // Do not mount the editor until the server workspace fetch finishes — otherwise
  // a late onVersionsReloaded can overwrite in-memory edits before they save.
  useEffect(() => {
    if (!user) {
      setWorkspaceReady(false)
      return
    }
    let cancelled = false
    setWorkspaceReady(false)
    void waitForWorkspace().finally(() => {
      if (!cancelled) setWorkspaceReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    const onTemplates = () => setShowTemplates(true)
    const onAdmin = () => setShowAdmin(true)
    const onSaveTemplate = (e: Event) => {
      const detail = (e as CustomEvent<Version>).detail
      if (detail) setSaveVersion(detail)
    }
    window.addEventListener(WEB_OPEN_TEMPLATES, onTemplates)
    window.addEventListener(WEB_OPEN_ADMIN, onAdmin)
    window.addEventListener(WEB_SAVE_TEMPLATE, onSaveTemplate)
    return () => {
      window.removeEventListener(WEB_OPEN_TEMPLATES, onTemplates)
      window.removeEventListener(WEB_OPEN_ADMIN, onAdmin)
      window.removeEventListener(WEB_SAVE_TEMPLATE, onSaveTemplate)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setShowTemplates(false)
      setShowAdmin(false)
      setSaveVersion(null)
    }
  }, [user])

  if (!ready || (user && !workspaceReady)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-text">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-muted">{user ? 'Loading workspace…' : 'Checking session…'}</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <LoginScreen
        onLoggedIn={() => {
          setUser(getAuthUser())
        }}
      />
    )
  }

  return (
    <>
      <App key={user.id} />
      {showTemplates && <TemplatesPanel onClose={() => setShowTemplates(false)} />}
      {saveVersion && (
        <TemplateSaveModal version={saveVersion} onClose={() => setSaveVersion(null)} />
      )}
      {showAdmin && user.role === 'admin' && (
        <AdminUsersModal onClose={() => setShowAdmin(false)} />
      )}
    </>
  )
}
