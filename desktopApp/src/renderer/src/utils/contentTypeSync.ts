import type { ContentType, FaviconContent, IconConfig } from '../types'

export const FAVICON_CONTENT_TYPE_OPTIONS: { label: string; value: ContentType }[] = [
  { label: 'Letters / Text', value: 'letters' },
  { label: 'Geometric Shape', value: 'shape' },
  { label: 'Icon Library', value: 'lucide' },
  { label: 'Custom SVG', value: 'svg-markup' },
  { label: 'SVG Path (d=)', value: 'svg' },
  { label: 'Image Upload', value: 'image' },
  { label: 'Canva', value: 'canva' }
]

export function contentTypeLabel(type: ContentType): string {
  return FAVICON_CONTENT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}

/** Wrap a raw SVG path `d` attribute as markup drawIcon can render. */
export function wrapSvgPath(path: string, color: string, viewBox = '0 0 24 24'): string {
  const d = path.trim()
  if (!d) return ''
  if (d.startsWith('<')) return d
  const esc = d.replace(/"/g, '&quot;')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${esc}" fill="${color || '#ffffff'}"/></svg>`
}

/** Extract path `d` from markup, or return raw path text. */
export function unwrapSvgPath(markup: string): string {
  const m = markup.trim()
  if (!m) return ''
  if (!m.startsWith('<')) return m
  const match = m.match(/\bd=["']([^"']+)["']/i)
  return match?.[1] ?? m
}

export function isSvgMarkupString(markup: string): boolean {
  const m = markup.trim()
  return m.startsWith('<') && /<svg[\s>]/i.test(m)
}

/** Map a logo icon config to the favicon content-type it represents. */
export function contentTypeFromIcon(icon: IconConfig): ContentType {
  switch (icon.sourceType) {
    case 'letters':
      return icon.text === ' ' ? 'canva' : 'letters'
    case 'shape':
      return 'shape'
    case 'lucide':
      return 'lucide'
    case 'image':
      return 'image'
    case 'svg':
      return isSvgMarkupString(icon.svgMarkup ?? '') ? 'svg-markup' : 'svg'
    default:
      return 'shape'
  }
}

/** Apply a favicon content-type switch onto a logo icon config. */
export function iconPatchForContentType(
  type: ContentType,
  icon: IconConfig,
  faviconContent?: FaviconContent
): Partial<IconConfig> {
  switch (type) {
    case 'letters':
      return {
        sourceType: 'letters',
        text: icon.text ?? faviconContent?.text ?? 'A',
        textColor: icon.textColor ?? faviconContent?.textColor ?? icon.primaryColor ?? '#ffffff',
        fontFamily: icon.fontFamily ?? faviconContent?.fontFamily ?? 'Inter',
        fontWeight: icon.fontWeight ?? faviconContent?.fontWeight ?? '700',
        fontItalic: icon.fontItalic ?? faviconContent?.fontItalic ?? false,
        fontUnderline: icon.fontUnderline ?? faviconContent?.fontUnderline ?? false,
        fontSizeRatio: icon.fontSizeRatio ?? faviconContent?.fontSizeRatio ?? 0.52,
        letterSpacing: icon.letterSpacing ?? faviconContent?.letterSpacing ?? 0
      }
    case 'shape':
      return {
        sourceType: 'shape',
        shape: icon.shape === 'none' ? (faviconContent?.shape ?? 'rounded') : icon.shape,
        primaryColor: icon.primaryColor ?? faviconContent?.shapeColor ?? '#6366f1',
        shapeSizeRatio: icon.shapeSizeRatio ?? faviconContent?.shapeSizeRatio ?? 0.5,
        shapeBorderRadius: icon.shapeBorderRadius ?? faviconContent?.shapeBorderRadius ?? 0
      }
    case 'lucide':
      return {
        sourceType: 'lucide',
        lucideIconName: icon.lucideIconName || faviconContent?.lucideIconName || 'Layers',
        primaryColor: icon.primaryColor ?? faviconContent?.lucideColor ?? '#ffffff',
        lucideSizeRatio: icon.lucideSizeRatio ?? faviconContent?.lucideSizeRatio ?? 0.6,
        lucideStrokeWidth: icon.lucideStrokeWidth ?? faviconContent?.lucideStrokeWidth ?? 2
      }
    case 'svg-markup':
      return {
        sourceType: 'svg',
        svgMarkup: icon.svgMarkup || faviconContent?.svgMarkup || '',
        primaryColor: icon.primaryColor ?? faviconContent?.lucideColor ?? '#ffffff',
        svgMarkupSizeRatio: icon.svgMarkupSizeRatio ?? faviconContent?.svgMarkupSizeRatio ?? 0.7,
        svgMarkupUseOriginalColors:
          icon.svgMarkupUseOriginalColors ?? faviconContent?.svgMarkupUseOriginalColors ?? false,
        svgMarkupSecondaryColor: icon.svgMarkupSecondaryColor ?? faviconContent?.svgMarkupSecondaryColor ?? '',
        svgMarkupTertiaryColor: icon.svgMarkupTertiaryColor ?? faviconContent?.svgMarkupTertiaryColor ?? '',
        svgMarkupColor4: icon.svgMarkupColor4 ?? faviconContent?.svgMarkupColor4 ?? '',
        svgMarkupColor5: icon.svgMarkupColor5 ?? faviconContent?.svgMarkupColor5 ?? ''
      }
    case 'svg': {
      const color = icon.primaryColor ?? faviconContent?.svgColor ?? '#ffffff'
      const path = unwrapSvgPath(icon.svgMarkup ?? '') || faviconContent?.svgPath || ''
      return {
        sourceType: 'svg',
        primaryColor: color,
        svgMarkup: wrapSvgPath(path, color),
        svgMarkupUseOriginalColors: false,
        svgMarkupSizeRatio: icon.svgMarkupSizeRatio ?? 0.7
      }
    }
    case 'image':
      return {
        sourceType: 'image',
        imageDataUrl: icon.imageDataUrl || faviconContent?.imageDataUrl || '',
        imageSizeRatio: icon.imageSizeRatio ?? faviconContent?.imageSizeRatio ?? 0.8,
        imageUseOriginalColors: icon.imageUseOriginalColors ?? faviconContent?.imageUseOriginalColors ?? true,
        imagePalette: icon.imagePalette?.length ? icon.imagePalette : (faviconContent?.imagePalette ?? []),
        imageColor1: icon.imageColor1 ?? faviconContent?.imageColor1 ?? '',
        imageColor2: icon.imageColor2 ?? faviconContent?.imageColor2 ?? '',
        imageColor3: icon.imageColor3 ?? faviconContent?.imageColor3 ?? '',
        imageColor4: icon.imageColor4 ?? faviconContent?.imageColor4 ?? '',
        imageColor5: icon.imageColor5 ?? faviconContent?.imageColor5 ?? ''
      }
    case 'canva':
      return {
        sourceType: 'letters',
        text: ' ',
        textColor: faviconContent?.canvaPrimaryColor ?? icon.textColor ?? icon.primaryColor ?? '#6366f1',
        fontSizeRatio: 0.52
      }
    default:
      return { sourceType: 'shape' }
  }
}

/** Map logo icon → favicon content type (for copy logo → favicon). */
export function contentTypeFromIconForFavicon(icon: IconConfig): ContentType {
  return contentTypeFromIcon(icon)
}
