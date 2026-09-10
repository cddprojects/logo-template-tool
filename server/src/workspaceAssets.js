import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { workspaceAssetsUserDir } from './db.js'

/** asset:sha256:<hex>;b64;<mime> | asset:sha256:<hex>;utf8;<mime> */
const ASSET_REF_RE = /^asset:sha256:([a-f0-9]{64});(b64|utf8);(.+)$/i
const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]+)$/i

/** Min length for data: / large SVG strings to extract (keep tiny strings inline). */
const MIN_EXTRACT_CHARS = 96

export function isAssetRef(value) {
  return typeof value === 'string' && ASSET_REF_RE.test(value)
}

export function parseAssetRef(value) {
  if (typeof value !== 'string') return null
  const m = ASSET_REF_RE.exec(value)
  if (!m) return null
  return { hash: m[1].toLowerCase(), kind: m[2].toLowerCase(), mime: m[3] }
}

export function makeAssetRef(hash, mime, kind = 'b64') {
  const k = kind === 'utf8' ? 'utf8' : 'b64'
  return `asset:sha256:${hash};${k};${mime || 'application/octet-stream'}`
}

function ensureUserDir(dataDir, userId) {
  const dir = workspaceAssetsUserDir(dataDir, userId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function assetFilePath(dataDir, userId, hash) {
  return path.join(workspaceAssetsUserDir(dataDir, userId), hash)
}

export function assetExists(dataDir, userId, hash) {
  return fs.existsSync(assetFilePath(dataDir, userId, hash))
}

export function writeAssetBytes(dataDir, userId, hash, bytes) {
  const dir = ensureUserDir(dataDir, userId)
  const file = path.join(dir, hash)
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, bytes)
  }
  return file
}

export function readAssetBytes(dataDir, userId, hash) {
  const file = assetFilePath(dataDir, userId, hash)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file)
}

function decodeDataUrl(dataUrl) {
  const m = DATA_URL_RE.exec(dataUrl)
  if (!m) return null
  const mime = m[1].trim()
  try {
    const bytes = Buffer.from(m[2], 'base64')
    if (!bytes.length) return null
    return { mime, bytes }
  } catch {
    return null
  }
}

function hashBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function toDataUrl(mime, bytes) {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}

function shouldExtractString(value) {
  if (typeof value !== 'string' || value.length < MIN_EXTRACT_CHARS) return false
  if (isAssetRef(value)) return false
  if (DATA_URL_RE.test(value)) return true
  const trimmed = value.trimStart()
  if (trimmed.length >= 4096 && /^<svg[\s>]/i.test(trimmed)) return true
  return false
}

function extractOneString(dataDir, userId, value) {
  if (DATA_URL_RE.test(value)) {
    const decoded = decodeDataUrl(value)
    if (!decoded) return value
    const hash = hashBytes(decoded.bytes)
    writeAssetBytes(dataDir, userId, hash, decoded.bytes)
    return makeAssetRef(hash, decoded.mime, 'b64')
  }
  const bytes = Buffer.from(value, 'utf8')
  const hash = hashBytes(bytes)
  writeAssetBytes(dataDir, userId, hash, bytes)
  return makeAssetRef(hash, 'image/svg+xml', 'utf8')
}

function rehydrateOneString(dataDir, userId, value) {
  const ref = parseAssetRef(value)
  if (!ref) return value
  const bytes = readAssetBytes(dataDir, userId, ref.hash)
  if (!bytes) {
    console.warn('[workspace-assets] missing asset', userId, ref.hash.slice(0, 12))
    return value
  }
  if (ref.kind === 'utf8') return bytes.toString('utf8')
  return toDataUrl(ref.mime, bytes)
}

/**
 * Deep-walk a JSON value; extract large blobs to disk.
 * Mutates arrays/objects in place — pass a clone if the original must be kept.
 */
export function extractAssetsFromValue(dataDir, userId, value, refs = new Set()) {
  if (value == null) return { value, refs }
  if (typeof value === 'string') {
    if (!shouldExtractString(value)) return { value, refs }
    const next = extractOneString(dataDir, userId, value)
    const parsed = parseAssetRef(next)
    if (parsed) refs.add(parsed.hash)
    return { value: next, refs }
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = extractAssetsFromValue(dataDir, userId, value[i], refs)
      value[i] = r.value
    }
    return { value, refs }
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const r = extractAssetsFromValue(dataDir, userId, value[key], refs)
      value[key] = r.value
    }
    return { value, refs }
  }
  return { value, refs }
}

export function rehydrateAssetsInValue(dataDir, userId, value) {
  if (value == null) return value
  if (typeof value === 'string') {
    return isAssetRef(value) ? rehydrateOneString(dataDir, userId, value) : value
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = rehydrateAssetsInValue(dataDir, userId, value[i])
    }
    return value
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = rehydrateAssetsInValue(dataDir, userId, value[key])
    }
    return value
  }
  return value
}

export function collectAssetRefs(value, refs = new Set()) {
  if (value == null) return refs
  if (typeof value === 'string') {
    const parsed = parseAssetRef(value)
    if (parsed) refs.add(parsed.hash)
    return refs
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, refs)
    return refs
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) collectAssetRefs(value[key], refs)
    return refs
  }
  return refs
}

export function removeUserAssets(dataDir, userId) {
  const dir = workspaceAssetsUserDir(dataDir, userId)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function putAssetFromDataUrl(dataDir, userId, dataUrl) {
  const decoded = decodeDataUrl(dataUrl)
  if (!decoded) throw new Error('Invalid data URL')
  const hash = hashBytes(decoded.bytes)
  writeAssetBytes(dataDir, userId, hash, decoded.bytes)
  return {
    hash,
    mime: decoded.mime,
    kind: 'b64',
    ref: makeAssetRef(hash, decoded.mime, 'b64'),
    bytes: decoded.bytes.length
  }
}

export function putAssetFromBuffer(dataDir, userId, mime, buffer, kind = 'b64') {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const hash = hashBytes(bytes)
  writeAssetBytes(dataDir, userId, hash, bytes)
  const k = kind === 'utf8' ? 'utf8' : 'b64'
  return {
    hash,
    mime: mime || 'application/octet-stream',
    kind: k,
    ref: makeAssetRef(hash, mime, k),
    bytes: bytes.length
  }
}

/** Same extract rules as server — used by docs/tests; client has its own copy for hashing. */
export { shouldExtractString, DATA_URL_RE, MIN_EXTRACT_CHARS }
