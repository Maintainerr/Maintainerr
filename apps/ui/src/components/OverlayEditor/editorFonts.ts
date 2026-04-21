import { buildOverlayFontUrl } from '../../api/overlays'

export interface OverlayEditorFont {
  name: string
  path: string
}

const loadedOverlayFonts = new Map<string, Promise<void>>()
const overlayFontVersions = new Map<string, number>()

const normalizeFontKey = (value: string) => {
  const segments = value.replace(/\\/g, '/').split('/')
  return segments[segments.length - 1]?.toLowerCase() ?? ''
}

export const getOverlayFontFamily = (fontName: string) =>
  fontName.replace(/\.[^.]+$/, '')

export const getOverlayPreviewFontFamily = (
  fontPath: string,
  fontFamily: string,
) => (fontPath ? getOverlayFontFamily(fontPath) : fontFamily)

const getOverlayFontVersion = (fontName: string) =>
  overlayFontVersions.get(normalizeFontKey(fontName)) ?? 0

const getOverlayFontCacheKey = (fontName: string) => {
  const normalized = normalizeFontKey(fontName)
  return `${normalized}?v=${getOverlayFontVersion(fontName)}`
}

export const invalidateOverlayEditorFont = (fontName: string) => {
  const normalized = normalizeFontKey(fontName)
  overlayFontVersions.set(normalized, getOverlayFontVersion(fontName) + 1)

  for (const cacheKey of loadedOverlayFonts.keys()) {
    if (cacheKey.startsWith(`${normalized}?`)) {
      loadedOverlayFonts.delete(cacheKey)
    }
  }
}

export const findOverlayFont = (
  fonts: OverlayEditorFont[],
  fontPath: string,
) => {
  const normalized = normalizeFontKey(fontPath)

  return fonts.find(
    (font) =>
      normalizeFontKey(font.name) === normalized ||
      normalizeFontKey(font.path) === normalized,
  )
}

const loadOverlayFont = async (font: OverlayEditorFont) => {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    return
  }

  const cacheKey = getOverlayFontCacheKey(font.name)
  const existing = loadedOverlayFonts.get(cacheKey)
  if (existing) {
    return existing
  }

  const loadPromise = (async () => {
    const family = getOverlayFontFamily(font.name)
    const face = new FontFace(
      family,
      `url(${buildOverlayFontUrl(font.name, getOverlayFontVersion(font.name))})`,
    )
    const loadedFace = await face.load()
    document.fonts.add(loadedFace)
  })()

  loadedOverlayFonts.set(cacheKey, loadPromise)

  try {
    await loadPromise
  } catch (error) {
    loadedOverlayFonts.delete(cacheKey)
    throw error
  }
}

export const loadOverlayEditorFonts = async (fonts: OverlayEditorFont[]) => {
  await Promise.all(fonts.map((font) => loadOverlayFont(font)))
}
