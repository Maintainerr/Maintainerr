import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../test-utils/createDeferred'
import PlexSettings, { hasUnsavedPlexServerChanges } from './index'

const getApiHandler = vi.fn()
const updateSettings = vi.fn()
const deletePlexAuth = vi.fn()
const updatePlexAuth = vi.fn()
const refetchServers = vi.fn()
const usePlexServersMock = vi.fn()

let updateSettingsPending = false
let deletePlexAuthPending = false
let updatePlexAuthPending = false
const axiosGet = vi.fn()
let loginErrorMessage: string | null = null
let plexServersResponse: {
  data: Array<unknown> | undefined
  isFetching: boolean
  isError: boolean
  refetch: typeof refetchServers
}
let currentSettings: {
  clientId?: string
  plex_hostname?: string
  plex_port?: number
  plex_name?: string
  plex_ssl?: number
  plex_auth_token?: string
  plex_manual_mode?: number
} = {}

vi.mock('../../../api/settings', () => ({
  usePatchSettings: () => ({
    mutateAsync: updateSettings,
    isPending: updateSettingsPending,
  }),
  useDeletePlexAuth: () => ({
    mutateAsync: deletePlexAuth,
    isPending: deletePlexAuthPending,
  }),
  useUpdatePlexAuth: () => ({
    mutateAsync: updatePlexAuth,
    isPending: updatePlexAuthPending,
  }),
  usePlexServers: (options: unknown) => {
    usePlexServersMock(options)
    return plexServersResponse
  },
}))

vi.mock('..', () => ({
  useSettingsOutletContext: () => ({
    settings: currentSettings,
  }),
}))

vi.mock('../../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
}))

vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => axiosGet(...args),
  },
}))

vi.mock('react-toastify', () => ({
  toast: {
    promise: (promise: Promise<unknown>) => promise,
  },
}))

vi.mock('../../Login/Plex', () => ({
  default: ({
    onAuthToken,
    onError,
    isProcessing,
  }: {
    onAuthToken: (token: string) => void | Promise<void>
    onError?: (message: string) => void
    isProcessing?: boolean
  }) => (
    <button
      type="button"
      onClick={() => {
        if (loginErrorMessage) {
          onError?.(loginErrorMessage)
          return
        }

        void onAuthToken('plex-token')
      }}
    >
      {isProcessing ? 'Authenticating…' : 'Authenticate with Plex'}
    </button>
  ),
}))

beforeEach(() => {
  currentSettings = {
    clientId: 'client-id',
    plex_hostname: 'plex.local',
    plex_port: 32400,
    plex_name: 'Plex',
    plex_ssl: 0,
    plex_auth_token: 'masked-plex-token',
  }

  updateSettingsPending = false
  deletePlexAuthPending = false
  updatePlexAuthPending = false
  loginErrorMessage = null
  plexServersResponse = {
    data: undefined,
    isFetching: false,
    isError: false,
    refetch: refetchServers,
  }

  getApiHandler.mockReset()
  updateSettings.mockReset()
  deletePlexAuth.mockReset()
  updatePlexAuth.mockReset()
  axiosGet.mockReset()
  refetchServers.mockReset()
  usePlexServersMock.mockReset()
  axiosGet.mockResolvedValue({ status: 200 })

  getApiHandler.mockImplementation((url: string) => {
    if (url === '/settings/test/plex' || url === '/settings/test/plex/auth') {
      return Promise.resolve({
        status: 'OK',
        code: 1,
        message: '1.0.0',
      })
    }

    throw new Error(`Unexpected request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
})

describe('hasUnsavedPlexServerChanges', () => {
  it('returns false when the saved and current Plex server settings match', () => {
    expect(
      hasUnsavedPlexServerChanges(
        {
          hostname: 'plex.local',
          port: '32400',
          name: 'Plex',
          ssl: false,
        },
        {
          hostname: 'plex.local',
          port: '32400',
          name: 'Plex',
          ssl: false,
        },
      ),
    ).toBe(false)
  })

  it('returns true when any Plex server setting differs from the saved values', () => {
    expect(
      hasUnsavedPlexServerChanges(
        {
          hostname: 'plex.internal',
          port: '32400',
          name: 'Plex',
          ssl: false,
        },
        {
          hostname: 'plex.local',
          port: '32400',
          name: 'Plex',
          ssl: false,
        },
      ),
    ).toBe(true)

    expect(
      hasUnsavedPlexServerChanges(
        {
          hostname: 'plex.local',
          port: '32401',
          name: 'Plex Dev',
          ssl: true,
        },
        {
          hostname: 'plex.local',
          port: '32400',
          name: 'Plex',
          ssl: false,
        },
      ),
    ).toBe(true)
  })
})

describe('PlexSettings', () => {
  it('keeps save and test actions unavailable until Plex credentials exist', () => {
    currentSettings.plex_auth_token = undefined

    render(<PlexSettings />)

    expect(
      (
        screen.getByRole('button', {
          name: 'Test Connection',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: 'Save Changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('keeps Save Changes enabled when Plex credentials exist regardless of whether server settings have changed', () => {
    render(<PlexSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })

    return waitFor(() => {
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('keeps Test Connection enabled when Plex credentials exist', async () => {
    render(<PlexSettings />)

    await waitFor(() => {
      expect(
        (
          screen.getByRole('button', {
            name: 'Test Connection',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false)
    })
  })

  it('keeps Test Connection unavailable until a Plex server has been selected', () => {
    currentSettings.plex_hostname = undefined
    currentSettings.plex_port = undefined
    currentSettings.plex_name = undefined

    render(<PlexSettings />)

    expect(
      (
        screen.getByRole('button', {
          name: 'Test Connection',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('keeps Test Connection unavailable while Plex authentication is still being persisted', () => {
    const authRequest = createDeferred<void>()

    currentSettings.plex_auth_token = undefined

    updatePlexAuth.mockImplementation(() => {
      updatePlexAuthPending = true
      return authRequest.promise
    })

    const { rerender } = render(<PlexSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Authenticate with Plex' }),
    )

    rerender(<PlexSettings />)

    expect(
      (
        screen.getByRole('button', {
          name: 'Test Connection',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    authRequest.resolve()
  })

  it('keeps server discovery disabled until Plex authentication has been validated', async () => {
    currentSettings.plex_hostname = undefined
    currentSettings.plex_port = undefined
    currentSettings.plex_name = undefined

    const validationRequest = createDeferred<{
      status: string
      code: number
      message: string
    }>()

    getApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/test/plex/auth') {
        return validationRequest.promise
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    render(<PlexSettings />)

    expect(usePlexServersMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    )

    validationRequest.resolve({
      status: 'OK',
      code: 1,
      message: '1.0.0',
    })

    await waitFor(() => {
      expect(usePlexServersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: true }),
      )
    })
  })

  it('re-validates stored Plex tokens through the auth-only endpoint', async () => {
    render(<PlexSettings />)

    await waitFor(() => {
      expect(getApiHandler).toHaveBeenCalledWith('/settings/test/plex/auth')
    })
  })

  it('does not flash stored-token validation errors immediately after fresh Plex auth succeeds', async () => {
    currentSettings.plex_auth_token = undefined
    currentSettings.plex_hostname = undefined
    currentSettings.plex_port = undefined
    currentSettings.plex_name = undefined

    const authValidationRequest = createDeferred<{
      status: string
      code: number
      message: string
    }>()

    getApiHandler.mockImplementation((url: string) => {
      if (url === '/settings/test/plex/auth') {
        return authValidationRequest.promise
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    const { rerender } = render(<PlexSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Authenticate with Plex' }),
    )

    currentSettings.plex_auth_token = 'masked-plex-token'
    rerender(<PlexSettings />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Authenticated' })).toBeTruthy()
    })

    expect(
      screen.queryByText(
        'Stored Plex credentials are invalid. Re-authenticate with Plex.',
      ),
    ).toBeNull()

    authValidationRequest.resolve({
      status: 'OK',
      code: 1,
      message: 'Success',
    })

    await waitFor(() => {
      expect(getApiHandler).toHaveBeenCalledWith('/settings/test/plex/auth')
    })

    expect(
      screen.queryByText(
        'Stored Plex credentials are invalid. Re-authenticate with Plex.',
      ),
    ).toBeNull()
  })

  it('surfaces specific Plex authentication errors to the user', async () => {
    currentSettings.plex_auth_token = undefined
    loginErrorMessage = 'Authentication timed out. Please try again.'

    render(<PlexSettings />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Authenticate with Plex' }),
    )

    await waitFor(() => {
      expect(
        screen.getByText('Authentication timed out. Please try again.'),
      ).toBeTruthy()
    })
  })

  it('requires a hostname before saving manual mode', async () => {
    render(<PlexSettings />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Authenticated' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Advanced Settings' }))
    fireEvent.click(screen.getByLabelText(/Enable manual mode/i))

    const hostnameInput = await screen.findByLabelText(/Hostname \/ IP/i)

    fireEvent.change(hostnameInput, {
      target: { value: '   ' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(
        screen.getByText('Please enter a hostname or IP address.'),
      ).toBeTruthy()
    })

    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('requires a valid port before saving manual mode', async () => {
    render(<PlexSettings />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Authenticated' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Advanced Settings' }))
    fireEvent.click(screen.getByLabelText(/Enable manual mode/i))

    const portInput = await screen.findByLabelText(/^Port$/i)

    fireEvent.change(portInput, {
      target: { value: '70000' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid port.')).toBeTruthy()
    })

    expect(updateSettings).not.toHaveBeenCalled()
  })
})
