/**
 * versionMigrate — make OLD saved JSON work with today’s field list.
 *
 * When we add a new setting (e.g. letterSpacing), old .igtemplate / versions.json
 * files don’t have it. On load we deep-merge each logo/favicon with
 * DEFAULT_LOGO_CONFIG / DEFAULT_FAVICON_CONFIG so missing keys get safe defaults.
 *
 * Paint sessions are migrated additively (paintSessionMigrate) — we fill gaps
 * and stamp version:1, but we never clear bake flags. Clearing those flags once
 * caused Outer+Inner to be punched away on old templates.
 *
 * Used by: useVersions (load), template “Update all”, Electron main when rewriting
 * .igtemplate files, web updateAllTemplates.
 *
 * Safe to import from Electron main — no React, no canvas, no DOM.
 */
import type {
  AssetVariant,
  FaviconConfig,
  IconConfig,
  LogoConfig,
  Version
} from '../types'
import { DEFAULT_FAVICON_CONFIG, DEFAULT_LOGO_CONFIG } from '../types'
import { migratePaintSession } from './paintSessionMigrate'

/** Stamp version:1 / fill missing paint fields on any nested paint session (additive). */
function migrateIconPaintSessions(icon: IconConfig | null | undefined): IconConfig | null | undefined {
  if (!icon) return icon
  if (!icon.paintSession) return icon
  const paintSession = migratePaintSession(icon.paintSession)
  return { ...icon, paintSession: paintSession ?? icon.paintSession }
}

/**
 * Deep-merge a logo variant's config with the current defaults.
 * Any field added to LogoConfig/IconConfig after the template was saved will
 * receive its default value, keeping old templates forward-compatible.
 */
export function migrateLogoVariant(v: AssetVariant<LogoConfig>): AssetVariant<LogoConfig> {
  const cfg = (v.config ?? {}) as Partial<LogoConfig>
  const icon = migrateIconPaintSessions({
    ...DEFAULT_LOGO_CONFIG.icon,
    ...cfg.icon
  })!
  const syncedIcon = migrateIconPaintSessions(cfg.syncedIcon ?? null) ?? null
  const syncedIconSnapshot = migrateIconPaintSessions(cfg.syncedIconSnapshot ?? null) ?? null
  return {
    ...v,
    config: {
      ...DEFAULT_LOGO_CONFIG,
      ...cfg,
      icon,
      syncedIcon,
      syncedIconSnapshot
    }
  }
}

/**
 * Deep-merge a favicon variant's config with the current defaults.
 */
export function migrateFaviconVariant(v: AssetVariant<FaviconConfig>): AssetVariant<FaviconConfig> {
  const cfg = (v.config ?? {}) as Partial<FaviconConfig>
  const content = {
    ...DEFAULT_FAVICON_CONFIG.content,
    ...cfg.content
  }
  const paintSession = cfg.paintSession
    ? migratePaintSession(cfg.paintSession) ?? cfg.paintSession
    : null
  return {
    ...v,
    config: {
      ...DEFAULT_FAVICON_CONFIG,
      ...cfg,
      content,
      paintSession
    }
  }
}

/** Migrate from old single-logo format to variants array format, and fill defaults. */
export function migrateVersion(raw: Record<string, unknown>): Version {
  const v = raw as Version & { logo?: LogoConfig; favicon?: FaviconConfig }

  const rawLogos: AssetVariant<LogoConfig>[] =
    Array.isArray(v.logos) && v.logos.length > 0
      ? v.logos
      : [{ id: 'logo_legacy', label: 'Dark', config: v.logo ?? { ...DEFAULT_LOGO_CONFIG } }]

  const rawFavicons: AssetVariant<FaviconConfig>[] =
    Array.isArray(v.favicons) && v.favicons.length > 0
      ? v.favicons
      : [{ id: 'fav_legacy', label: 'Dark', config: v.favicon ?? { ...DEFAULT_FAVICON_CONFIG } }]

  return {
    id: v.id,
    name: v.name,
    description: v.description,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    logos: rawLogos.map(migrateLogoVariant),
    favicons: rawFavicons.map(migrateFaviconVariant)
  }
}

/**
 * Normalize a .igtemplate / library payload to current schema (logos/favicons arrays
 * + full default field fill + paint session stamps).
 */
export function migrateIgTemplatePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const migrated = migrateVersion({
    id: typeof raw.id === 'string' ? raw.id : 'tmpl',
    name: (raw.name as string) || 'Untitled',
    description: (raw.description as string) || '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    logos: raw.logos as Version['logos'] | undefined,
    favicons: raw.favicons as Version['favicons'] | undefined,
    logo: raw.logo,
    favicon: raw.favicon
  } as Record<string, unknown>)

  return {
    schemaVersion: 1,
    name: migrated.name,
    description: migrated.description ?? '',
    logos: migrated.logos,
    favicons: migrated.favicons
  }
}

/** True when JSON serialization of logos/favicons/name/description differs after migrate. */
export function igTemplatePayloadNeedsUpgrade(raw: Record<string, unknown>): boolean {
  try {
    const next = migrateIgTemplatePayload(raw)
    const before = JSON.stringify({
      schemaVersion: raw.schemaVersion ?? 1,
      name: raw.name,
      description: raw.description ?? '',
      logos: raw.logos ?? (raw.logo ? [raw.logo] : []),
      favicons: raw.favicons ?? (raw.favicon ? [raw.favicon] : [])
    })
    const after = JSON.stringify(next)
    return before !== after
  } catch {
    return true
  }
}
