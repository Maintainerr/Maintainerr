import { buildOverlayFontUrl } from '../../api/overlays'

export interface OverlayEditorFont {
  name: string
  path: string
}

const loadedOverlayFonts = new Map<string, Promise<void>>()

const normalizeFontKey = (value: string) => {
  const segments = value.replace(/\\/g, '/').split('/')
  return segments[segments.length - 1]?.toLowerCase() ?? ''
}

export const getOverlayFontFamily = (fontName: string) =>
  fontName.replace(/\.[^.]+$/, '')

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

  const cacheKey = normalizeFontKey(font.name)
  const existing = loadedOverlayFonts.get(cacheKey)
  if (existing) {
    return existing
  }

  const loadPromise = (async () => {
    const family = getOverlayFontFamily(font.name)
    const face = new FontFace(family, `url(${buildOverlayFontUrl(font.name)})`)
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
