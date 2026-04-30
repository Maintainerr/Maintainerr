import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayTemplateEditorPage from './OverlayTemplateEditorPage'

const navigate = vi.fn()
const getOverlayTemplate = vi.fn()
const getOverlaySections = vi.fn()
const getOverlayFonts = vi.fn()
const getOverlayImages = vi.fn()
const uploadOverlayImage = vi.fn()
const loadOverlayEditorFonts = vi.fn()
const invalidateOverlayEditorFont = vi.fn()
const overlayCanvas = vi.fn(
  ({
    fontLoadVersion,
    imageLoadVersion,
  }: {
    fontLoadVersion?: number
    imageLoadVersion?: number
  }) => (
    <div data-testid="canvas">
      canvas:{fontLoadVersion ?? 0}:{imageLoadVersion ?? 0}
    </div>
  ),
)
const useUndoRedoMock = vi.fn()
let routeId = '42'

vi.mock('../api/overlays', () => ({
  buildItemImageUrl: vi.fn(),
  createOverlayTemplate: vi.fn(),
  getOverlayFonts: () => getOverlayFonts(),
  getOverlayImages: () => getOverlayImages(),
  getOverlaySections: () => getOverlaySections(),
  getOverlayTemplate: () => getOverlayTemplate(),
  getRandomEpisode: vi.fn(),
  getRandomItem: vi.fn(),
  updateOverlayTemplate: vi.fn(),
  uploadFont: vi.fn(),
  uploadOverlayImage: (file: File) => uploadOverlayImage(file),
}))

vi.mock('../components/OverlayEditor/editorFonts', () => ({
  invalidateOverlayEditorFont: (fontName: string) =>
    invalidateOverlayEditorFont(fontName),
  loadOverlayEditorFonts: (fonts: unknown[]) => loadOverlayEditorFonts(fonts),
}))

vi.mock('../components/OverlayEditor/ElementToolbox', () => ({
  ElementToolbox: () => <div>toolbox</div>,
}))

vi.mock('../components/OverlayEditor/LayerPanel', () => ({
  LayerPanel: ({ onSelect }: { onSelect: (id: string) => void }) => {
    useEffect(() => {
      onSelect('image-1')
    }, [onSelect])

    return <div>layers</div>
  },
}))

vi.mock('../components/OverlayEditor/OverlayCanvas', () => ({
  OverlayCanvas: (props: {
    fontLoadVersion?: number
    imageLoadVersion?: number
  }) => overlayCanvas(props),
}))

vi.mock('../components/OverlayEditor/PropertiesPanel', () => ({
  PropertiesPanel: ({
    onUploadImage,
  }: {
    onUploadImage: (file: File) => Promise<unknown>
  }) => (
    <button
      type="button"
      onClick={() => void onUploadImage(new File(['img'], 'poster.png'))}
    >
      upload image
    </button>
  ),
}))

vi.mock('../hooks/useUndoRedo', () => ({
  useUndoRedo: () => useUndoRedoMock(),
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ id: routeId }),
  }
})

describe('OverlayTemplateEditorPage', () => {
  beforeEach(() => {
    cleanup()
    routeId = '42'
    navigate.mockReset()
    getOverlayTemplate.mockReset()
    getOverlaySections.mockReset()
    getOverlayFonts.mockReset()
    getOverlayImages.mockReset()
    uploadOverlayImage.mockReset()
    loadOverlayEditorFonts.mockReset()
    invalidateOverlayEditorFont.mockReset()
    overlayCanvas.mockClear()
    useUndoRedoMock.mockReset()

    getOverlayTemplate.mockReturnValue(new Promise(() => {}))
    getOverlaySections.mockResolvedValue([])
    getOverlayFonts.mockResolvedValue([])
    getOverlayImages.mockResolvedValue([])
    uploadOverlayImage.mockResolvedValue({
      name: 'poster.png',
      path: '/tmp/poster.png',
    })
    loadOverlayEditorFonts.mockResolvedValue(undefined)
    useUndoRedoMock.mockReturnValue({
      current: [],
      set: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      reset: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the editor shell visible while an existing template is still loading', () => {
    render(<OverlayTemplateEditorPage />)

    expect(screen.getByRole('heading', { name: 'Edit Template' })).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'Save Changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (screen.getByPlaceholderText('Template Name') as HTMLInputElement)
        .disabled,
    ).toBe(true)
  })

  it('rerenders the canvas after editor fonts finish loading', async () => {
    let resolveFonts: (() => void) | undefined

    getOverlayTemplate.mockResolvedValue({
      id: 42,
      name: 'Template',
      description: '',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [
        {
          id: 'text-1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          rotation: 0,
          layerOrder: 0,
          opacity: 1,
          visible: true,
          text: 'Test',
          fontFamily: 'Inter',
          fontPath: 'Inter-Bold.ttf',
          fontSize: 20,
          fontColor: '#FFFFFF',
          fontWeight: 'bold',
          textAlign: 'left',
          verticalAlign: 'middle',
          backgroundColor: null,
          backgroundRadius: 0,
          backgroundPadding: 0,
          shadow: false,
          uppercase: false,
        },
      ],
      isDefault: false,
      isPreset: false,
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    })
    getOverlayFonts.mockResolvedValue([
      { name: 'Inter-Bold.ttf', path: 'Inter-Bold.ttf' },
    ])
    loadOverlayEditorFonts.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveFonts = resolve
      }),
    )

    render(<OverlayTemplateEditorPage />)

    await waitFor(() => {
      expect(loadOverlayEditorFonts).toHaveBeenCalledWith([
        { name: 'Inter-Bold.ttf', path: 'Inter-Bold.ttf' },
      ])
    })

    expect(screen.getByTestId('canvas').textContent).toBe('canvas:0:0')

    resolveFonts?.()

    await waitFor(() => {
      expect(screen.getByTestId('canvas').textContent).toBe('canvas:1:0')
    })
  })

  it('keeps image upload successful even if the follow-up list refresh fails', async () => {
    getOverlayTemplate.mockResolvedValue({
      id: 42,
      name: 'Template',
      description: '',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [
        {
          id: 'image-1',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          layerOrder: 0,
          opacity: 1,
          visible: true,
          imagePath: 'poster.png',
        },
      ],
      isDefault: false,
      isPreset: false,
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    })
    useUndoRedoMock.mockReturnValue({
      current: [
        {
          id: 'image-1',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          layerOrder: 0,
          opacity: 1,
          visible: true,
          imagePath: 'poster.png',
        },
      ],
      set: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      reset: vi.fn(),
    })
    getOverlayImages
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('refresh failed'))

    render(<OverlayTemplateEditorPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'upload image' })).toBeTruthy()
    })

    expect(screen.getByTestId('canvas').textContent).toBe('canvas:0:0')

    screen.getByRole('button', { name: 'upload image' }).click()

    await waitFor(() => {
      expect(uploadOverlayImage).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('canvas').textContent).toBe('canvas:0:1')
    })
  })
})
