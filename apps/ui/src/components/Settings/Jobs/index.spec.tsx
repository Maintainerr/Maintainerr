import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('enables Save Changes only while cron settings are dirty and valid', () => {
    render(<JobSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    const ruleHandlerInput = screen.getByLabelText(/Rule Handler/i)

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(ruleHandlerInput, { target: { value: '0 2 * * *' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(ruleHandlerInput, { target: { value: 'invalid cron' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(ruleHandlerInput, { target: { value: '0 0 * * *' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
  })
})
