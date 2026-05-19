import { MediaServerType } from '@maintainerr/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MediaServerSelector from './index'

const navigate = vi.fn()
const invalidateQueries = vi.fn()
const refetchQueries = vi.fn()
const previewSwitch = vi.fn()
const switchServer = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries,
      refetchQueries,
    }),
  }
})

vi.mock('../../../api/settings', () => ({
  usePreviewMediaServerSwitch: () => ({
    mutateAsync: previewSwitch,
    isPending: false,
  }),
  useSwitchMediaServer: () => ({
    mutateAsync: switchServer,
    isPending: false,
  }),
}))

vi.mock('../../../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

describe('MediaServerSelector', () => {
  beforeEach(() => {
    navigate.mockReset()
    invalidateQueries.mockReset()
    refetchQueries.mockReset()
    previewSwitch.mockReset()
    switchServer.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('uses the shared icon placement classes for all media server options', () => {
    render(<MediaServerSelector currentType={MediaServerType.PLEX} />)

    const plexLogo = screen.getByRole('img', { name: 'Plex' })
    const jellyfinLogo = screen.getByRole('img', { name: 'Jellyfin' })
    const embyLogo = screen.getByRole('img', { name: 'Emby' })

    expect(plexLogo.getAttribute('class')).toBe(
      'h-10 w-10 rounded object-contain',
    )
    expect(jellyfinLogo.getAttribute('class')).toBe(
      plexLogo.getAttribute('class'),
    )
    expect(embyLogo.getAttribute('class')).toBe(plexLogo.getAttribute('class'))
  })
})
