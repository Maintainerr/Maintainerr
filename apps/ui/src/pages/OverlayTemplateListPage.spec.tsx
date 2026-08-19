import type { OverlayTemplate } from '@maintainerr/contracts'
import { render, screen } from '../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverlayTemplateListPage from './OverlayTemplateListPage'

const navigate = vi.fn()
const getOverlayTemplates = vi.fn()

vi.mock('../api/overlays', () => ({
  getOverlayTemplates: () => getOverlayTemplates(),
  deleteOverlayTemplate: vi.fn(),
  duplicateOverlayTemplate: vi.fn(),
  exportOverlayTemplate: vi.fn(),
  importOverlayTemplate: vi.fn(),
  setDefaultOverlayTemplate: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('OverlayTemplateListPage', () => {
  beforeEach(() => {
    navigate.mockReset()
    getOverlayTemplates.mockReset()
  })

  it('keeps the page shell visible while templates are still loading', () => {
    getOverlayTemplates.mockReturnValue(new Promise(() => {}))

    render(<OverlayTemplateListPage />)

    expect(
      screen.getByRole('heading', { name: 'Overlay Templates' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy()
  })

  // Two templates can share a name across modes, and a title card default is
  // inert until something draws on an episode. Both sections say who they are
  // for, next to the star that sets their default (#3455, #2770).
  it('says which media each mode is drawn on', async () => {
    const template = (
      id: number,
      mode: OverlayTemplate['mode'],
    ): OverlayTemplate => ({
      id,
      name: 'Leave Soon',
      description: '',
      mode,
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [],
      isDefault: false,
      isPreset: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    getOverlayTemplates.mockResolvedValue([
      template(1, 'poster'),
      template(2, 'titlecard'),
    ])

    render(<OverlayTemplateListPage />)

    expect(
      await screen.findByText('Drawn on movies, shows and seasons.'),
    ).toBeTruthy()
    expect(screen.getByText('Drawn on episodes.')).toBeTruthy()
  })
})
