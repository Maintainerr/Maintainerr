import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findOverlayFont,
  getOverlayFontFamily,
  getOverlayPreviewFontFamily,
  invalidateOverlayEditorFont,
  loadOverlayEditorFonts,
} from './editorFonts'

describe('editorFonts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('matches saved font paths against font names and absolute paths', () => {
    const fonts = [
      {
        name: 'BebasNeue-Regular.ttf',
        path: '/srv/data/overlays/fonts/BebasNeue-Regular.ttf',
      },
    ]

    expect(
      findOverlayFont(fonts, '/srv/data/overlays/fonts/BebasNeue-Regular.ttf'),
    ).toEqual(fonts[0])
    expect(findOverlayFont(fonts, 'BebasNeue-Regular.ttf')).toEqual(fonts[0])
    expect(getOverlayFontFamily('BebasNeue-Regular.ttf')).toBe(
      'BebasNeue-Regular',
    )
  })

  it('uses the loaded font alias for preview even when saved family differs', () => {
    expect(getOverlayPreviewFontFamily('Inter-Bold.ttf', 'Inter')).toBe(
      'Inter-Bold',
    )
    expect(getOverlayPreviewFontFamily('', 'Inter')).toBe('Inter')
  })

  it('loads each editor font once into the browser font registry', async () => {
    const add = vi.fn()
    const load = vi.fn().mockResolvedValue({ family: 'BebasNeue-Regular' })
    const FontFaceMock = vi.fn().mockImplementation(function MockFontFace(
      this: object,
    ) {
      return { load }
    })

    vi.stubGlobal('FontFace', FontFaceMock)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add },
    })

    const fonts = [
      {
        name: 'BebasNeue-Regular.ttf',
        path: '/srv/data/overlays/fonts/BebasNeue-Regular.ttf',
      },
    ]

    await loadOverlayEditorFonts(fonts)
    await loadOverlayEditorFonts(fonts)

    expect(FontFaceMock).toHaveBeenCalledTimes(1)
    expect(FontFaceMock).toHaveBeenCalledWith(
      'BebasNeue-Regular',
      expect.stringContaining('BebasNeue-Regular.ttf?v=0'),
    )
    expect(load).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('reloads a font with a cache-busting URL after invalidation', async () => {
    const add = vi.fn()
    const load = vi.fn().mockResolvedValue({ family: 'CacheBust-Regular' })
    const FontFaceMock = vi.fn().mockImplementation(function MockFontFace(
      this: object,
    ) {
      return { load }
    })

    vi.stubGlobal('FontFace', FontFaceMock)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add },
    })

    const fonts = [
      {
        name: 'CacheBust-Regular.ttf',
        path: '/srv/data/overlays/fonts/CacheBust-Regular.ttf',
      },
    ]

    await loadOverlayEditorFonts(fonts)
    invalidateOverlayEditorFont('CacheBust-Regular.ttf')
    await loadOverlayEditorFonts(fonts)

    expect(FontFaceMock).toHaveBeenCalledTimes(2)
    expect(FontFaceMock).toHaveBeenNthCalledWith(
      2,
      'CacheBust-Regular',
      expect.stringContaining('CacheBust-Regular.ttf?v=1'),
    )
  })
})
