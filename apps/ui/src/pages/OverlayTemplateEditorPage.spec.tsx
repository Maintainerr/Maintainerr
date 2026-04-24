import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayTemplateEditorPage from './OverlayTemplateEditorPage'

const navigate = vi.fn()
const getOverlayTemplate = vi.fn()
const getOverlaySections = vi.fn()
const getOverlayFonts = vi.fn()
const loadOverlayEditorFonts = vi.fn()
const invalidateOverlayEditorFont = vi.fn()
const overlayCanvas = vi.fn(
  ({ fontLoadVersion }: { fontLoadVersion?: number }) => (
    <div data-testid="canvas">canvas:{fontLoadVersion ?? 0}</div>
  ),
)
let routeId = '42'

vi.mock('../api/overlays', () => ({
  buildItemImageUrl: vi.fn(),
  createOverlayTemplate: vi.fn(),
  getOverlayFonts: () => getOverlayFonts(),
  getOverlaySections: () => getOverlaySections(),
  getOverlayTemplate: () => getOverlayTemplate(),
  getRandomEpisode: vi.fn(),
  getRandomItem: vi.fn(),
  updateOverlayTemplate: vi.fn(),
  uploadFont: vi.fn(),
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
  LayerPanel: () => <div>layers</div>,
}))

vi.mock('../components/OverlayEditor/OverlayCanvas', () => ({
  OverlayCanvas: (props: { fontLoadVersion?: number }) => overlayCanvas(props),
}))

vi.mock('../components/OverlayEditor/PropertiesPanel', () => ({
  PropertiesPanel: () => <div>properties</div>,
}))

vi.mock('../hooks/useUndoRedo', () => ({
  useUndoRedo: () => ({
    current: [],
    set: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    reset: vi.fn(),
  }),
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
    loadOverlayEditorFonts.mockReset()
    invalidateOverlayEditorFont.mockReset()
    overlayCanvas.mockClear()

    getOverlayTemplate.mockReturnValue(new Promise(() => {}))
    getOverlaySections.mockResolvedValue([])
    getOverlayFonts.mockResolvedValue([])
    loadOverlayEditorFonts.mockResolvedValue(undefined)
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

    expect(screen.getByTestId('canvas').textContent).toBe('canvas:0')

    resolveFonts?.()

    await waitFor(() => {
      expect(screen.getByTestId('canvas').textContent).toBe('canvas:1')
    })
  })
})
