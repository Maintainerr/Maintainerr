import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayTemplateEditorPage from './OverlayTemplateEditorPage'

const navigate = vi.fn()
const getOverlayTemplate = vi.fn()
const getOverlaySections = vi.fn()
const getOverlayFonts = vi.fn()

vi.mock('../api/overlays', () => ({
  buildPosterUrl: vi.fn(),
  createOverlayTemplate: vi.fn(),
  getOverlayFonts: () => getOverlayFonts(),
  getOverlaySections: () => getOverlaySections(),
  getOverlayTemplate: () => getOverlayTemplate(),
  getRandomEpisode: vi.fn(),
  getRandomItem: vi.fn(),
  updateOverlayTemplate: vi.fn(),
  uploadFont: vi.fn(),
}))

vi.mock('../components/OverlayEditor/ElementToolbox', () => ({
  ElementToolbox: () => <div>toolbox</div>,
}))

vi.mock('../components/OverlayEditor/LayerPanel', () => ({
  LayerPanel: () => <div>layers</div>,
}))

vi.mock('../components/OverlayEditor/OverlayCanvas', () => ({
  OverlayCanvas: () => <div>canvas</div>,
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
    useParams: () => ({ id: '42' }),
  }
})

describe('OverlayTemplateEditorPage', () => {
  beforeEach(() => {
    cleanup()
    navigate.mockReset()
    getOverlayTemplate.mockReset()
    getOverlaySections.mockReset()
    getOverlayFonts.mockReset()

    getOverlayTemplate.mockReturnValue(new Promise(() => {}))
    getOverlaySections.mockResolvedValue([])
    getOverlayFonts.mockResolvedValue([])
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
})
