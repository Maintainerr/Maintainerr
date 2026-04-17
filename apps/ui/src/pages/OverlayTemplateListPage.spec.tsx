import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    cleanup()
    navigate.mockReset()
    getOverlayTemplates.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the page shell visible while templates are still loading', () => {
    getOverlayTemplates.mockReturnValue(new Promise(() => {}))

    render(<OverlayTemplateListPage />)

    expect(
      screen.getByRole('heading', { name: 'Overlay Templates' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Import' })).toBeTruthy()
  })
})
