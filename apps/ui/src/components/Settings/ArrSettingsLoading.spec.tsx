import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RadarrSettings from './Radarr'
import SonarrSettings from './Sonarr'

const getApiHandler = vi.fn()
const deleteApiHandler = vi.fn()
const logClientError = vi.fn()
const toastError = vi.fn()

vi.mock('../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
  GetApiHandler: (url: string) => getApiHandler(url),
  DeleteApiHandler: (url: string) => deleteApiHandler(url),
}))

vi.mock('../../utils/ClientLogger', () => ({
  logClientError: (...args: unknown[]) => logClientError(...args),
}))

vi.mock('react-toastify', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock('./Radarr/SettingsModal', () => ({
  default: () => <div>Radarr modal</div>,
}))

vi.mock('./Sonarr/SettingsModal', () => ({
  default: () => <div>Sonarr modal</div>,
}))

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return {
    promise,
    resolve,
    reject,
  }
}

describe.each([
  {
    label: 'Radarr',
    path: '/settings/radarr',
    Component: RadarrSettings,
  },
  {
    label: 'Sonarr',
    path: '/settings/sonarr',
    Component: SonarrSettings,
  },
])('$label settings loading', ({ label, path, Component }) => {
  beforeEach(() => {
    getApiHandler.mockReset()
    deleteApiHandler.mockReset()
    logClientError.mockReset()
    toastError.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the shell stable while server settings load', async () => {
    const request = createDeferred<
      Array<{
        id: number
        serverName: string
        url: string
        apiKey: string
      }>
    >()

    getApiHandler.mockImplementation((url: string) => {
      if (url === path) {
        return request.promise
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    render(<Component />)

    expect(
      screen.getByRole('heading', { name: `${label} Settings` }),
    ).toBeTruthy()
    expect(
      screen.getByRole('status', { name: `Loading ${label} servers` }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add server' })).toBeNull()

    request.resolve([
      {
        id: 1,
        serverName: label,
        url: `http://${label.toLowerCase()}.local`,
        apiKey: 'token',
      },
    ])

    expect(await screen.findByText(label)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add server' })).toBeTruthy()
  })
})
