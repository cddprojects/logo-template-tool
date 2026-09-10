/**
 * Paint Match tool helpers for Inner uploaded images (contentBound stamps).
 * Marks label pixels as Color 1–5; remapping uses marks instead of nearest-palette.
 */

import {
  applyColorMarksRecolor,
  buildDefaultColorMarks,
  decodeColorMarkPng,
  encodeColorMarkPng,
  floodImageRegionMask,
  imageRecolorFieldsFromPalette,
  scanImagePalette
} from './imageRecolor'
import type { OutsideContentSettings } from '../types'
import type { LineObj } from '../components/iconPaint/paintHelpers'

function slotColors(item: {
  imagePalette?: string[]
  imageColor1?: string
  imageColor2?: string
  imageColor3?: string
  imageColor4?: string
  imageColor5?: string
}): string[] {
  const p = item.imagePalette ?? []
  return [
    (item.imageColor1 || '').trim() || p[0] || '',
    (item.imageColor2 || '').trim() || p[1] || '',
    (item.imageColor3 || '').trim() || p[2] || '',
    (item.imageColor4 || '').trim() || p[3] || '',
    (item.imageColor5 || '').trim() || p[4] || ''
  ]
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.width, h: img.height })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export function isInnerUploadedImageProxy(item: LineObj | null | undefined): boolean {
  return !!(
    item &&
    item.contentBound &&
    item.type === 'stamp' &&
    item.stampSource === 'image' &&
    (item.imageSourceDataUrl || item.imageDataUrl)
  )
}

export async function refreshStampFromMarks(item: LineObj): Promise<LineObj> {
  const source = item.imageSourceDataUrl || item.imageDataUrl
  if (!source) return item
  const map = await decodeColorMarkPng(item.colorMarkPng)
  const useOriginal = item.imageUseOriginalColors !== false
  let display = source
  if (!useOriginal && map) {
    display = await applyColorMarksRecolor(
      source,
      map.marks,
      map.w,
      map.h,
      slotColors(item)
    )
  }
  return { ...item, imageDataUrl: display }
}

/** Seed Color 1–5 + default marks on a contentBound image stamp. */
export async function enrichImageProxyWithMatch(
  item: LineObj,
  settings: OutsideContentSettings | null | undefined
): Promise<LineObj> {
  if (!item.imageDataUrl) return item
  // Work in stamp-crop pixel space (what Fill / Match click in Paint).
  let source = item.imageDataUrl
  let palette =
    settings?.imagePalette && settings.imagePalette.length > 0
      ? [...settings.imagePalette]
      : item.imagePalette && item.imagePalette.length > 0
        ? [...item.imagePalette]
        : await scanImagePalette(source)
  if (!palette.length) {
    palette = await scanImagePalette(source)
  }
  if (!palette.length) return item

  const defaults = imageRecolorFieldsFromPalette(palette)
  const colors = {
    imageColor1: (settings?.imageColor1 || item.imageColor1 || '').trim() || defaults.imageColor1,
    imageColor2: (settings?.imageColor2 || item.imageColor2 || '').trim() || defaults.imageColor2,
    imageColor3: (settings?.imageColor3 || item.imageColor3 || '').trim() || defaults.imageColor3,
    imageColor4: (settings?.imageColor4 || item.imageColor4 || '').trim() || defaults.imageColor4,
    imageColor5: (settings?.imageColor5 || item.imageColor5 || '').trim() || defaults.imageColor5
  }

  const stampSize = await loadImageSize(source)
  if (!stampSize) return item

  const useOriginal = settings?.imageUseOriginalColors ?? item.imageUseOriginalColors ?? true

  let markPng = settings?.imageColorMarkPng || item.colorMarkPng
  let map = await decodeColorMarkPng(markPng)
  if (!map || map.w !== stampSize.w || map.h !== stampSize.h) {
    // When Original is off the stamp bake is already remapped — assign marks by
    // nearest live Color 1–5 (not the pre-remap scanned palette).
    const markPalette =
      useOriginal
        ? palette
        : [colors.imageColor1, colors.imageColor2, colors.imageColor3, colors.imageColor4, colors.imageColor5].filter(
            (c) => !!c
          )
    const built = await buildDefaultColorMarks(
      source,
      markPalette.length ? markPalette : palette
    )
    if (built) {
      map = built
      markPng = encodeColorMarkPng(built.marks, built.w, built.h)
    }
  }

  const next: LineObj = {
    ...item,
    imageSourceDataUrl: source,
    imagePalette: palette,
    ...colors,
    colorMarkPng: markPng,
    imageUseOriginalColors: useOriginal
  }
  return refreshStampFromMarks(next)
}

function stampLocalPixel(
  item: LineObj,
  canvasPoint: { x: number; y: number },
  imgW: number,
  imgH: number
): { x: number; y: number } | null {
  if (item.pts.length < 2) return null
  const a = item.pts[0], b = item.pts[1]
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  const displayW = Math.max(1, Math.abs(b.x - a.x))
  const displayH = Math.max(1, Math.abs(b.y - a.y))
  if (
    canvasPoint.x < x ||
    canvasPoint.y < y ||
    canvasPoint.x > x + displayW ||
    canvasPoint.y > y + displayH
  ) {
    return null
  }
  return {
    x: Math.max(0, Math.min(imgW - 1, Math.floor(((canvasPoint.x - x) / displayW) * imgW))),
    y: Math.max(0, Math.min(imgH - 1, Math.floor(((canvasPoint.y - y) / displayH) * imgH)))
  }
}

export async function matchClickOnImageProxy(
  item: LineObj,
  localCanvasPt: { x: number; y: number },
  activeSlot: number
): Promise<LineObj | null> {
  if (!isInnerUploadedImageProxy(item)) return null
  if (activeSlot < 1 || activeSlot > 5) return null
  const source = item.imageSourceDataUrl || item.imageDataUrl
  if (!source) return null
  let map = await decodeColorMarkPng(item.colorMarkPng)
  if (!map) {
    const built = await buildDefaultColorMarks(source, item.imagePalette ?? [])
    if (!built) return null
    map = built
  }
  const px = stampLocalPixel(item, localCanvasPt, map.w, map.h)
  if (!px) return null
  const flooded = await floodImageRegionMask(source, px.x, px.y)
  if (!flooded) return null
  const marks = new Uint8Array(map.marks)
  const seedMark = marks[px.y * map.w + px.x] ?? 0
  const nextMark = seedMark === activeSlot ? 0 : activeSlot
  for (let p = 0; p < marks.length; p++) {
    if (flooded.region[p]) marks[p] = nextMark
  }
  return refreshStampFromMarks({
    ...item,
    colorMarkPng: encodeColorMarkPng(marks, map.w, map.h),
    imageUseOriginalColors: false,
    imageSourceDataUrl: source
  })
}

export async function fillMarkedSectionsOnImageProxy(
  item: LineObj,
  localCanvasPt: { x: number; y: number },
  fillCss: string
): Promise<{ item: LineObj; mark: number } | null> {
  if (!isInnerUploadedImageProxy(item)) return null
  const source = item.imageSourceDataUrl || item.imageDataUrl
  if (!source || !item.colorMarkPng) return null
  const map = await decodeColorMarkPng(item.colorMarkPng)
  if (!map) return null
  const px = stampLocalPixel(item, localCanvasPt, map.w, map.h)
  if (!px) return null
  const mark = map.marks[px.y * map.w + px.x] ?? 0
  if (mark < 1 || mark > 5) return null
  const hex = fillCss.startsWith('#') ? fillCss.slice(0, 7) : fillCss
  const key = `imageColor${mark}` as
    | 'imageColor1'
    | 'imageColor2'
    | 'imageColor3'
    | 'imageColor4'
    | 'imageColor5'
  return {
    item: await refreshStampFromMarks({
      ...item,
      [key]: hex,
      imageUseOriginalColors: false,
      imageSourceDataUrl: source
    }),
    mark
  }
}

export async function setImageProxySlotColor(
  item: LineObj,
  slot: number,
  hex: string
): Promise<LineObj | null> {
  if (!isInnerUploadedImageProxy(item) || slot < 1 || slot > 5) return null
  const key = `imageColor${slot}` as
    | 'imageColor1'
    | 'imageColor2'
    | 'imageColor3'
    | 'imageColor4'
    | 'imageColor5'
  return refreshStampFromMarks({
    ...item,
    [key]: hex,
    imageUseOriginalColors: false
  })
}
