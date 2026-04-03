import { MetadataProviderPreference } from '@maintainerr/contracts'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../test-utils/createDeferred'
import MetadataSettings from './Metadata'

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

  afterEach(() => {
    cleanup()
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

    render(<MetadataSettings />)

    expect(
      screen.getByRole('heading', { name: 'Metadata Settings' }),
    ).toBeTruthy()
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
    expect(screen.queryByRole('status')).toBeNull()

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

    render(<MetadataSettings />)

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
      await screen.findByText('Metadata provider preference updated'),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('switch', { name: 'TMDB primary' })
        .getAttribute('aria-checked'),
    ).toBe('false')
  })

  it('falls back to TMDB as primary when TVDB is selected without a configured API key', async () => {
    currentPreference = MetadataProviderPreference.TVDB_PRIMARY

    render(<MetadataSettings />)

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

  it('renders provider feedback in the shared page feedback slot above the cards', async () => {
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

    render(<MetadataSettings />)

    const [tmdbApiKeyInput] = await screen.findAllByLabelText('API Key')
    fireEvent.change(tmdbApiKeyInput, { target: { value: 'tmdb-key' } })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Test Connection' })[0],
    )

    const testStatusMessage = await screen.findByText(
      'Successfully connected to TMDB',
    )
    const firstProviderCard = screen.getAllByRole('listitem')[0]

    expect(
      testStatusMessage.compareDocumentPosition(firstProviderCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0])

    const saveStatusMessage = await screen.findByText('TMDB settings updated')

    expect(
      saveStatusMessage.compareDocumentPosition(firstProviderCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
  })

  it('shows the refresh-started message when metadata refresh succeeds', async () => {
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

    render(<MetadataSettings />)

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

    expect(
      await screen.findByText('TMDB metadata refresh started'),
    ).toBeTruthy()
  })

  it('enables Save Changes as soon as the API key changes without requiring a prior test', async () => {
    render(<MetadataSettings />)

    const [tmdbApiKeyInput] = await screen.findAllByLabelText('API Key')

    expect(
      (
        screen.getAllByRole('button', {
          name: 'Save Changes',
        })[0] as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    fireEvent.change(tmdbApiKeyInput, { target: { value: 'tmdb-key' } })

    await waitFor(() => {
      expect(
        (
          screen.getAllByRole('button', {
            name: 'Save Changes',
          })[0] as HTMLButtonElement
        ).disabled,
      ).toBe(false)
    })
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

    render(<MetadataSettings />)

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

    render(<MetadataSettings />)

    await waitFor(() => {
      expect(
        screen
          .getByRole('switch', { name: 'TVDB primary' })
          .getAttribute('aria-disabled'),
      ).toBe('false')
    })

    fireEvent.click(screen.getByRole('switch', { name: 'TVDB primary' }))

    expect(
      await screen.findByText('Metadata provider preference updated'),
    ).toBeTruthy()

    const [tmdbApiKeyInput] = await screen.findAllByLabelText('API Key')
    fireEvent.change(tmdbApiKeyInput, { target: { value: 'tmdb-key' } })

    await waitFor(() => {
      expect(
        screen.queryByText('Metadata provider preference updated'),
      ).toBeNull()
    })

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Test Connection' })[0],
    )

    expect(
      await screen.findByText('Successfully connected to TMDB'),
    ).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Save Changes' })[0])

    expect(await screen.findByText('TMDB settings updated')).toBeTruthy()
    expect(
      screen.queryByText('Metadata provider preference updated'),
    ).toBeNull()
  })
})
