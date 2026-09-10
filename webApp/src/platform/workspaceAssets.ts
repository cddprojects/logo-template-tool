/**
 * Pull large data: URLs / SVG markup out of a versions tree, upload each once,
 * and replace with asset:sha256 refs so PUT /api/workspace stays under Cloudflare limits.
 */

const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]+)$/i
const ASSET_REF_RE = /^asset:sha256:([a-f0-9]{64});(b64|utf8);(.+)$/i
const MIN_EXTRACT_CHARS = 96
const ASSET_UPLOAD_TIMEOUT_MS = 120000

/** Hashes already confirmed on the server this session. */
const uploadedHashes = new Set<string>()

function isAssetRef(value: string): boolean {
  return ASSET_REF_RE.test(value)
}

function makeAssetRef(hash: string, mime: string, kind: 'b64' | 'utf8'): string {
  return `asset:sha256:${hash};${kind};${mime || 'application/octet-stream'}`
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function shouldExtract(value: string): boolean {
  if (value.length < MIN_EXTRACT_CHARS) return false
  if (isAssetRef(value)) return false
  if (DATA_URL_RE.test(value)) return true
  const trimmed = value.trimStart()
  return trimmed.length >= 4096 && /^<svg[\s>]/i.test(trimmed)
}

type PendingAsset =
  | { hash: string; kind: 'b64'; mime: string; dataUrl: string }
  | { hash: string; kind: 'utf8'; mime: string; text: string }

async function collectPending(value: unknown, pending: Map<string, PendingAsset>): Promise<void> {
  if (value == null) return
  if (typeof value === 'string') {
    if (!shouldExtract(value)) return
    const dataMatch = DATA_URL_RE.exec(value)
    if (dataMatch) {
      const mime = dataMatch[1].trim()
      const bytes = base64ToBytes(dataMatch[2])
      const hash = await sha256Hex(bytes)
      if (!pending.has(hash)) {
        pending.set(hash, { hash, kind: 'b64', mime, dataUrl: value })
      }
      return
    }
    const enc = new TextEncoder()
    const bytes = enc.encode(value)
    const hash = await sha256Hex(bytes)
    if (!pending.has(hash)) {
      pending.set(hash, { hash, kind: 'utf8', mime: 'image/svg+xml', text: value })
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) await collectPending(item, pending)
    return
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      await collectPending((value as Record<string, unknown>)[key], pending)
    }
  }
}

async function replaceWithRefs(value: unknown): Promise<unknown> {
  if (value == null) return value
  if (typeof value === 'string') {
    if (!shouldExtract(value)) return value
    const dataMatch = DATA_URL_RE.exec(value)
    if (dataMatch) {
      const mime = dataMatch[1].trim()
      const bytes = base64ToBytes(dataMatch[2])
      const hash = await sha256Hex(bytes)
      return makeAssetRef(hash, mime, 'b64')
    }
    const enc = new TextEncoder()
    const hash = await sha256Hex(enc.encode(value))
    return makeAssetRef(hash, 'image/svg+xml', 'utf8')
  }
  if (Array.isArray(value)) {
    const next = []
    for (const item of value) next.push(await replaceWithRefs(item))
    return next
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as object)) {
      out[key] = await replaceWithRefs((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

async function uploadOne(asset: PendingAsset): Promise<void> {
  if (uploadedHashes.has(asset.hash)) return
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ASSET_UPLOAD_TIMEOUT_MS)
  try {
    const body =
      asset.kind === 'b64'
        ? { dataUrl: asset.dataUrl }
        : { text: asset.text, mime: asset.mime, kind: 'utf8' }
    const res = await fetch(`/api/workspace/assets/${asset.hash}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text()
      let err = `HTTP ${res.status}`
      try {
        const json = JSON.parse(text) as { error?: string }
        if (json.error) err = json.error
      } catch {
        if (text) err = text.slice(0, 200)
      }
      throw new Error(err)
    }
    uploadedHashes.add(asset.hash)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx]!)
    }
  })
  await Promise.all(workers)
}

/**
 * Clone versions, upload large blobs, return a slim tree safe for workspace PUT.
 * Does not mutate the live editor state.
 */
export async function externalizeWorkspaceVersions(versions: unknown[]): Promise<unknown[]> {
  const clone = structuredClone(versions)
  const pending = new Map<string, PendingAsset>()
  await collectPending(clone, pending)

  const toUpload = [...pending.values()].filter((a) => !uploadedHashes.has(a.hash))
  if (toUpload.length) {
    await mapPool(toUpload, 3, uploadOne)
  }
  for (const hash of pending.keys()) uploadedHashes.add(hash)

  return (await replaceWithRefs(clone)) as unknown[]
}
