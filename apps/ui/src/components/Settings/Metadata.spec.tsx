import { MetadataProviderPreference } from '@maintainerr/contracts'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../test-utils/createDeferred'
import { createTestQueryClient } from '../../test-utils/queryClient'
import MetadataSettings from './Metadata'

const renderMetadata = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MetadataSettings />
    </QueryClientProvider>,
  )

const getApiHandler = vi.fn()
const deleteApiHandler = vi.fn()
const postApiHandler = vi.fn()
const mutateAsync = vi.fn()

let currentPreference = MetadataProviderPreference.TMDB_PRIMARY
let preferenceLoading = false
let preferenceSaving = false

vi.mock('../../api/settings', () => ({
  useMetadataProviderPreference: () => ({
    data: currentPreference,
    isLoading: preferenceLoading,
  }),
  useUpdateMetadataProviderPreference: () => ({
    mutateAsync,
    isPending: preferenceSaving,
  }),
}))

vi.mock('../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
  GetApiHandler: (url: string) => getApiHandler(url),
  DeleteApiHandler: (url: string) => deleteApiHandler(url),
  PostApiHandler: (url: string, payload?: unknown) =>
    postApiHandler(url, payload),
}))

describe('MetadataSettings', () => {
  beforeEach(() => {
    currentPreference = MetadataProviderPreference.TMDB_PRIMARY
    preferenceLoading = false
    preferenceSaving = false

    getApiHandler.mockReset()
    deleteApiHandler.mockReset()
    postApiHandler.mockReset()
    mutateAsync.mockReset()

    getApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/tmdb' || url === '/settings/tvdb') {
        return Promise.resolve({ api_key: '' })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    mutateAsync.mockImplementation(
      async (value: MetadataProviderPreference) => {
        currentPreference = value

        return {
          status: 'OK',
          code: 1,
          message: 'Updated',
        }
      },
    )

    postApiHandler.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Updated',
    })
  })

  it('keeps the selector shell and provider cards visible while provider settings load', () => {
    const tmdbRequest = createDeferred<{ api_key: string }>()
    const tvdbRequest = createDeferred<{ api_key: string }>()

    preferenceLoading = true
    getApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/tmdb') {
        return tmdbRequest.promise
      }

      if (url === '/settings/tvdb') {
        return tvdbRequest.promise
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderMetadata()

    const tmdbSwitch = screen.getByRole('switch', {
      name: 'TMDB primary',
    })
    const tvdbSwitch = screen.getByRole('switch', {
      name: 'TVDB primary',
    })

    expect(tmdbSwitch).toBeTruthy()
    expect(tvdbSwitch).toBeTruthy()
    expect(screen.getAllByText('TVDB').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    screen
      .getAllByRole('status')
      .forEach((status) => expect(status.textContent).toBe(''))

    expect(tmdbSwitch.getAttribute('aria-disabled')).toBe('true')
    expect(tvdbSwitch.getAttribute('aria-disabled')).toBe('true')
  })

  it('updates the primary provider directly from the provider switch and shows inline page feedback', async () => {
    getApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/tmdb') {
        return Promise.resolve({ api_key: '' })
      }

      if (url === '/settings/tvdb') {
        return Promise.resolve({ api_key: 'tvdb-key' })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderMetadata()

    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', { name: 'TVDB primary' })
          .getAttribute('aria-disabled'),
      ).toBe('false')
    })

    fireEvent.click(screen.getByRole('switch', { name: 'TVDB primary' }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(
        MetadataProviderPreference.TVDB_PRIMARY,
      )
    })

    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', { name: 'TVDB primary' })
          .getAttribute('aria-checked'),
      ).toBe('true')
    })

    expect(
      await within(screen.getAllByRole('listitem')[1]).findByText('Saved'),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('switch', { name: 'TMDB primary' })
        .getAttribute('aria-checked'),
    ).toBe('false')
  })

  it('falls back to TMDB as primary when TVDB is selected without a configured API key', async () => {
    currentPreference = MetadataProviderPreference.TVDB_PRIMARY

    renderMetadata()

    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', { name: 'TMDB primary' })
          .getAttribute('aria-checked'),
      ).toBe('true')
    })

    expect(
      screen
        .getByRole('switch', { name: 'TVDB primary' })
        .getAttribute('aria-checked'),
    ).toBe('false')
    expect(
      screen
        .getByRole('switch', { name: 'TVDB primary' })
        .getAttribute('aria-disabled'),
    ).toBe('true')
  })

  it('shows provider feedback beside the title of that provider card', async () => {
    postApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/test/tmdb') {
        return Promise.resolve({
          status: 'OK',
          code: 1,
          message: 'Connected',
        })
      }

      if (url === '/settings/tmdb') {
        return Promise.resolve({
          status: 'OK',
          code: 1,
          message: 'Saved',
        })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderMetadata()

    const [tmdbApiKeyInput] = await screen.findAllByLabelText('API Key')
    fireEvent.change(tmdbApiKeyInput, { target: { value: 'tmdb-key' } })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Test Connection' })[0],
    )

    const tmdbCard = screen.getAllByRole('listitem')[0]

    expect(tmdbCard.contains(await screen.findByText('Success!'))).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0])

    expect(tmdbCard.contains(await screen.findByText('Saved'))).toBe(true)
  })

  it('shows that a refresh is running once it starts', async () => {
    postApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/metadata/refresh/tmdb') {
        return Promise.resolve({
          status: 'OK',
          code: 1,
          message: 'TMDB metadata refresh started',
        })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderMetadata()

    await waitFor(() => {
      expect(
        (
          screen.getAllByRole('button', {
            name: 'Refresh metadata',
          })[0] as HTMLButtonElement
        ).disabled,
      ).toBe(false)
    })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Refresh metadata' })[0],
    )

    expect(await screen.findByText('Refreshing')).toBeTruthy()
  })

  it('tests TMDB with the built-in key while its field is empty', async () => {
    renderMetadata()

    await screen.findAllByLabelText('API Key')
    const [tmdbTest, tvdbTest] = screen.getAllByRole('button', {
      name: 'Test Connection',
    }) as HTMLButtonElement[]

    await waitFor(() => {
      expect(tmdbTest.disabled).toBe(false)
    })
    expect(tvdbTest.disabled).toBe(true)
  })

  it('keeps Save Changes enabled regardless of whether the API key has changed', async () => {
    renderMetadata()

    await screen.findAllByLabelText('API Key')

    expect(
      (
        screen.getAllByRole('button', {
          name: 'Save Changes',
        })[0] as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('allows clearing a saved API key and saving the empty value', async () => {
    getApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/tmdb') {
        return Promise.resolve({ api_key: 'tmdb-key' })
      }

      if (url === '/settings/tvdb') {
        return Promise.resolve({ api_key: '' })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    deleteApiHandler.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Deleted',
    })

    renderMetadata()

    const [tmdbApiKeyInput] = await screen.findAllByLabelText('API Key')

    fireEvent.change(tmdbApiKeyInput, { target: { value: '' } })

    await waitFor(() => {
      expect(
        (
          screen.getAllByRole('button', {
            name: 'Save Changes',
          })[0] as HTMLButtonElement
        ).disabled,
      ).toBe(false)
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0])

    await waitFor(() => {
      expect(deleteApiHandler).toHaveBeenCalledWith('/settings/tmdb')
    })
  })

  it('clears stale page-level preference feedback before provider saves', async () => {
    getApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/tmdb') {
        return Promise.resolve({ api_key: '' })
      }

      if (url === '/settings/tvdb') {
        return Promise.resolve({ api_key: 'tvdb-key' })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    postApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/test/tmdb') {
        return Promise.resolve({
          status: 'OK',
          code: 1,
          message: 'Connected',
        })
      }

      if (url === '/settings/tmdb') {
        return Promise.resolve({
          status: 'OK',
          code: 1,
          message: 'Saved',
        })
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    renderMetadata()

    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', { name: 'TVDB primary' })
          .getAttribute('aria-disabled'),
      ).toBe('false')
    })

    fireEvent.click(screen.getByRole('switch', { name: 'TVDB primary' }))

    const [tmdbCard, tvdbCard] = screen.getAllByRole('listitem')
    expect(await within(tvdbCard).findByText('Saved')).toBeTruthy()

    const [tmdbApiKeyInput] = await screen.findAllByLabelText('API Key')
    fireEvent.change(tmdbApiKeyInput, { target: { value: 'tmdb-key' } })

    await waitFor(() => {
      expect(within(tvdbCard).queryByText('Saved')).toBeNull()
    })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Test Connection' })[0],
    )

    expect(await within(tmdbCard).findByText('Success!')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0])

    expect(await within(tmdbCard).findByText('Saved')).toBeTruthy()
    expect(within(tvdbCard).queryByText('Saved')).toBeNull()
  })
})
