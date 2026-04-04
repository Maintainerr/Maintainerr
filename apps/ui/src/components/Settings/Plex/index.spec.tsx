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

let updateSettingsPending = false
let deletePlexAuthPending = false
let updatePlexAuthPending = false
const axiosGet = vi.fn()
let currentSettings: {
  plex_hostname?: string
  plex_port?: number
  plex_name?: string
  plex_ssl?: number
  plex_auth_token?: string
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
    isProcessing,
  }: {
    onAuthToken: (token: string) => void | Promise<void>
    isProcessing?: boolean
  }) => (
    <button type="button" onClick={() => onAuthToken('plex-token')}>
      {isProcessing ? 'Authenticating…' : 'Authenticate with Plex'}
    </button>
  ),
}))

beforeEach(() => {
  currentSettings = {
    plex_hostname: 'plex.local',
    plex_port: 32400,
    plex_name: 'Plex',
    plex_ssl: 0,
    plex_auth_token: 'masked-plex-token',
  }

  updateSettingsPending = false
  deletePlexAuthPending = false
  updatePlexAuthPending = false

  getApiHandler.mockReset()
  updateSettings.mockReset()
  deletePlexAuth.mockReset()
  updatePlexAuth.mockReset()
  axiosGet.mockReset()
  axiosGet.mockResolvedValue({ status: 200 })

  getApiHandler.mockImplementation((url: string) => {
    if (url === '/settings/test/plex') {
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

  it('keeps Save Changes disabled until Plex server settings change and disables it again when reverted', () => {
    render(<PlexSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    const hostnameInput = screen.getByLabelText('Hostname or IP')

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(hostnameInput, { target: { value: 'plex.internal' } })

    expect(
      (
        screen.getByRole('button', {
          name: 'Save Changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)

    fireEvent.change(hostnameInput, { target: { value: 'plex.local' } })

    expect(
      (
        screen.getByRole('button', {
          name: 'Save Changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('disables Test Connection while Plex server settings are dirty and re-enables it when reverted', () => {
    render(<PlexSettings />)

    const testButton = screen.getByRole('button', { name: 'Test Connection' })
    const hostnameInput = screen.getByLabelText('Hostname or IP')

    expect((testButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(hostnameInput, { target: { value: 'plex.internal' } })

    expect(
      (
        screen.getByRole('button', {
          name: 'Test Connection',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    fireEvent.change(hostnameInput, { target: { value: 'plex.local' } })

    expect(
      (
        screen.getByRole('button', {
          name: 'Test Connection',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })

  it('keeps Test Connection unavailable while Plex authentication is still being persisted', () => {
    const authRequest = createDeferred<void>()

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

  it('allows saving a Plex token manually with the shared save-button pattern', async () => {
    updatePlexAuth.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    })

    render(<PlexSettings />)

    const saveTokenButton = screen.getByRole('button', { name: 'Save Token' })

    expect((saveTokenButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Manual Token/i), {
      target: { value: 'manual-plex-token' },
    })

    expect(
      (screen.getByRole('button', { name: 'Save Token' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Save Token' }))

    await waitFor(() => {
      expect(updatePlexAuth).toHaveBeenCalledWith('manual-plex-token')
      expect(axiosGet).toHaveBeenCalled()
    })
  })
})
