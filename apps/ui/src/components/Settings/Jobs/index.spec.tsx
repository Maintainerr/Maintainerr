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

let updateSettingsPending = false
let currentSettings = {
  rules_handler_job_cron: '0 0 * * *',
  collection_handler_job_cron: '0 1 * * *',
}

vi.mock('../../../api/settings', () => ({
  usePatchSettings: () => ({
    mutateAsync: updateSettings,
    isPending: updateSettingsPending,
  }),
}))

vi.mock('..', () => ({
  useSettingsOutletContext: () => ({
    settings: currentSettings,
  }),
}))

describe('JobSettings', () => {
  beforeEach(() => {
    updateSettingsPending = false
    updateSettings.mockReset()
    currentSettings = {
      rules_handler_job_cron: '0 0 * * *',
      collection_handler_job_cron: '0 1 * * *',
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps Save Changes enabled when cron settings are valid and disables it on invalid input', () => {
    render(<JobSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    const ruleHandlerInput = screen.getByLabelText(/Rule Handler/i)

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(ruleHandlerInput, { target: { value: 'invalid cron' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(ruleHandlerInput, { target: { value: '0 0 * * *' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('normalizes repeated spaces before saving and keeps the success feedback visible after settings refresh', async () => {
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

    fireEvent.change(ruleHandlerInput, {
      target: { value: '0  0-23/8 * * *' },
    })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        collection_handler_job_cron: '0 1 * * *',
        rules_handler_job_cron: '0 0-23/8 * * *',
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
