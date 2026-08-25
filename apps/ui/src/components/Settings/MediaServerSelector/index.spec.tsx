import { MediaServerType } from '@maintainerr/contracts'
import { fireEvent, render, screen, within } from '../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MediaServerSelector from './index'

const navigate = vi.fn()
const invalidateQueries = vi.fn()
const refetchQueries = vi.fn()
const previewSwitch = vi.fn()
const switchServer = vi.fn()
let switchPending = false

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
    isPending: switchPending,
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
    switchPending = false
  })

  // Closing mid-switch cannot stop the request, and skipped the finish step
  // that reloads settings, so the dialog offers no close until it is done.
  it('cannot be closed while the switch is running', async () => {
    previewSwitch.mockResolvedValue({
      currentServerType: MediaServerType.JELLYFIN,
      targetServerType: MediaServerType.PLEX,
      dataToBeCleared: {
        collections: 0,
        collectionMedia: 0,
        exclusions: 0,
        collectionLogs: 0,
      },
      dataToBeKept: {
        generalSettings: true,
        radarrSettings: 0,
        sonarrSettings: 0,
        sportarrSettings: 0,
        seerrSettings: false,
        tautulliSettings: false,
        notificationSettings: false,
      },
    })
    const { rerender } = render(
      <MediaServerSelector currentType={MediaServerType.JELLYFIN} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Plex/ }))
    await screen.findByRole('dialog')

    switchPending = true
    rerender(<MediaServerSelector currentType={MediaServerType.JELLYFIN} />)
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(
      within(dialog).getByRole('button', { name: /Switching/ }),
    ).toHaveProperty('disabled', true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('uses the shared icon placement classes for all media server options', () => {
    render(<MediaServerSelector currentType={MediaServerType.PLEX} />)

    const plexLogo = screen.getByRole('img', { name: 'Plex' })
    const jellyfinLogo = screen.getByRole('img', { name: 'Jellyfin' })
    const embyLogo = screen.getByRole('img', { name: 'Emby' })

    expect(plexLogo.getAttribute('class')).toBe(
      'h-10 w-10 rounded-sm object-contain',
    )
    expect(jellyfinLogo.getAttribute('class')).toBe(
      plexLogo.getAttribute('class'),
    )
    expect(embyLogo.getAttribute('class')).toBe(plexLogo.getAttribute('class'))
  })
})
