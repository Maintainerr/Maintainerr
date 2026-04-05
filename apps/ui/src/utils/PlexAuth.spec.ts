import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlexOAuth from './PlexAuth'

const axiosPost = vi.fn()
const axiosGet = vi.fn()

vi.mock('axios', () => ({
  default: {
    post: (...args: unknown[]) => axiosPost(...args),
    get: (...args: unknown[]) => axiosGet(...args),
  },
}))

vi.mock('bowser', () => ({
  default: {
    getParser: () => ({
      getOSName: () => 'Linux',
      getOSVersion: () => '1.0',
      getBrowserName: () => 'Firefox',
      getBrowserVersion: () => '137.0',
    }),
  },
}))

describe('PlexOAuth', () => {
  let popup: {
    closed: boolean
    close: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    location: { href: string }
  }

  beforeEach(() => {
    popup = {
      closed: false,
      close: vi.fn(() => {
        popup.closed = true
      }),
      focus: vi.fn(),
      location: { href: '' },
    }

    axiosPost.mockReset()
    axiosGet.mockReset()

    axiosPost.mockResolvedValue({ data: { id: 42, code: 'ABCD' } })

    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects when the Plex client identifier is missing', async () => {
    const plexOAuth = new PlexOAuth()

    plexOAuth.preparePopup()

    await expect(plexOAuth.login('')).rejects.toThrow(
      'Missing Plex client identifier. Refresh the page and try again.',
    )
    expect(axiosPost).not.toHaveBeenCalled()
  })

  it('rejects when Plex authentication times out', async () => {
    const plexOAuth = new PlexOAuth()
    const now = 1_700_000_000_000

    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now)
      .mockReturnValueOnce(now + 5 * 60 * 1000)

    plexOAuth.preparePopup()

    await expect(plexOAuth.login('client-id')).rejects.toThrow(
      'Authentication timed out. Please try again.',
    )
    expect(axiosGet).not.toHaveBeenCalled()
    expect(popup.close).toHaveBeenCalled()
  })

  it('rejects when the Plex PIN has expired', async () => {
    const plexOAuth = new PlexOAuth()
    const now = 1_700_000_000_000

    vi.spyOn(Date, 'now').mockReturnValue(now)
    axiosGet.mockResolvedValue({
      data: { expiresAt: new Date(now - 1_000).toISOString() },
    })

    plexOAuth.preparePopup()

    await expect(plexOAuth.login('client-id')).rejects.toThrow(
      'Authentication PIN expired. Please try again.',
    )
    expect(popup.close).toHaveBeenCalled()
  })
})
