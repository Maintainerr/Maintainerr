import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JobSettings from './index'

const updateSettings = vi.fn()
const getOverlaySettings = vi.fn()
const updateOverlaySettings = vi.fn()

let updateSettingsPending = false
let currentSettings = {
  rules_handler_job_cron: '0 0 * * *',
  collection_handler_job_cron: '0 1 * * *',
}
let currentOverlaySettings = {
  cronSchedule: '0 2 * * *',
}

vi.mock('../../../api/settings', () => ({
  usePatchSettings: () => ({
    mutateAsync: updateSettings,
    isPending: updateSettingsPending,
  }),
}))

vi.mock('../../../api/overlays', () => ({
  getOverlaySettings: () => getOverlaySettings(),
  updateOverlaySettings: (payload: { cronSchedule: string | null }) =>
    updateOverlaySettings(payload),
}))

vi.mock('..', () => ({
  useSettingsOutletContext: () => ({
    settings: currentSettings,
  }),
}))

const createDeferred = <T,>() => {
  let resolve: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve: resolve! }
}

describe('JobSettings', () => {
  beforeEach(() => {
    updateSettingsPending = false
    updateSettings.mockReset()
    getOverlaySettings.mockReset()
    updateOverlaySettings.mockReset()
    currentSettings = {
      rules_handler_job_cron: '0 0 * * *',
      collection_handler_job_cron: '0 1 * * *',
    }
    currentOverlaySettings = {
      cronSchedule: '0 2 * * *',
    }

    getOverlaySettings.mockResolvedValue(currentOverlaySettings)
    updateOverlaySettings.mockImplementation(async (payload) => {
      currentOverlaySettings = {
        cronSchedule: payload.cronSchedule ?? '',
      }

      return currentOverlaySettings
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps Save Changes disabled until the overlay schedule finishes loading', async () => {
    const deferred = createDeferred<{ cronSchedule: string }>()
    getOverlaySettings.mockReturnValueOnce(deferred.promise)

    render(<JobSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    const overlayInput = screen.getByLabelText(/Overlay Handler/i)

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
    expect((overlayInput as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Loading current overlay schedule...')).toBeTruthy()

    deferred.resolve({ cronSchedule: '0 2 * * *' })

    await waitFor(() => {
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    })
    expect((overlayInput as HTMLInputElement).disabled).toBe(false)
  })

  it('keeps Save Changes enabled when cron settings are valid and disables it on invalid input', async () => {
    render(<JobSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    const ruleHandlerInput = screen.getByLabelText(/Rule Handler/i)

    await waitFor(() => {
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.change(ruleHandlerInput, { target: { value: 'invalid cron' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(ruleHandlerInput, { target: { value: '0 0 * * *' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('normalizes repeated spaces before saving without clearing the loaded overlay schedule', async () => {
    updateSettings.mockImplementation(async (payload) => {
      currentSettings = {
        rules_handler_job_cron: payload.rules_handler_job_cron,
        collection_handler_job_cron: payload.collection_handler_job_cron,
      }

      return { status: 'OK' }
    })

    const view = render(<JobSettings />)

    const ruleHandlerInput = screen.getByLabelText(/Rule Handler/i)
    const saveButton = screen.getByRole('button', { name: 'Save Changes' })

    await waitFor(() => {
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.change(ruleHandlerInput, {
      target: { value: '0  0-23/8 * * *' },
    })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        collection_handler_job_cron: '0 1 * * *',
        rules_handler_job_cron: '0 0-23/8 * * *',
      })
      expect(updateOverlaySettings).toHaveBeenCalledWith({
        cronSchedule: '0 2 * * *',
      })
    })

    expect(await screen.findByText('Job settings updated')).toBeTruthy()

    view.rerender(<JobSettings />)

    expect(screen.getByText('Job settings updated')).toBeTruthy()
    expect(
      (screen.getByLabelText(/Rule Handler/i) as HTMLInputElement).value,
    ).toBe('0 0-23/8 * * *')
  })
})
