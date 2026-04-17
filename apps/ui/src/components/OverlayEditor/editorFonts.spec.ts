import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findOverlayFont,
  getOverlayFontFamily,
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
    expect(load).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(1)
  })
})
