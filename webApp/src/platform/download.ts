/** Trigger a browser download for a Blob or data URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;]+);base64,/.exec(dataUrl)
  const mime = match?.[1] ?? 'application/octet-stream'
  return new Blob([dataUrlToUint8Array(dataUrl)], { type: mime })
}

/**
 * Pack one or more PNG buffers into a Vista+ ICO (PNG-compressed images).
 * Avoids needing Node's png-to-ico in the browser.
 */
export function pngBuffersToIco(pngs: Uint8Array[]): Blob {
  const count = pngs.length
  const headerSize = 6
  const dirEntrySize = 16
  const dirSize = headerSize + dirEntrySize * count
  let offset = dirSize
  const offsets: number[] = []
  for (const png of pngs) {
    offsets.push(offset)
    offset += png.length
  }
  const total = offset
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)

  // ICONDIR
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true) // ICO
  view.setUint16(4, count, true)

  for (let i = 0; i < count; i++) {
    const png = pngs[i]
    const entry = headerSize + i * dirEntrySize
    // Width/height: 0 means 256 in ICO
    let w = 0
    let h = 0
    // Read IHDR if present
    if (png.length >= 24 && png[12] === 0x49 && png[13] === 0x48 && png[14] === 0x44 && png[15] === 0x52) {
      const ihdr = new DataView(png.buffer, png.byteOffset + 16, 8)
      const pw = ihdr.getUint32(0)
      const ph = ihdr.getUint32(4)
      w = pw >= 256 ? 0 : pw
      h = ph >= 256 ? 0 : ph
    }
    out[entry] = w
    out[entry + 1] = h
    out[entry + 2] = 0
    out[entry + 3] = 0
    view.setUint16(entry + 4, 1, true)
    view.setUint16(entry + 6, 32, true)
    view.setUint32(entry + 8, png.length, true)
    view.setUint32(entry + 12, offsets[i], true)
    out.set(png, offsets[i])
  }

  return new Blob([out], { type: 'image/x-icon' })
}
