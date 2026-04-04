import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GetApiHandler from '../../../utils/ApiHandler'
import MainSettings from './index'

const updateSettings = vi.fn()

let updateSettingsPending = false
let currentSettings = {
  applicationUrl: 'http://maintainerr.local',
  apikey: 'saved-api-key',
  media_server_type: 'plex',
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

vi.mock('../../../utils/ApiHandler', () => ({
  default: vi.fn(),
}))

vi.mock('../../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

vi.mock('../MediaServerSelector', () => ({
  default: () => <div>Media Server Selector</div>,
}))

vi.mock('./DatabaseBackupModal', () => ({
  default: () => <div>Backup Modal</div>,
}))

describe('MainSettings', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)

  beforeEach(() => {
    updateSettingsPending = false
    updateSettings.mockReset()
    getApiHandlerMock.mockReset()
    getApiHandlerMock.mockResolvedValue('generated-api-key' as never)
    currentSettings = {
      applicationUrl: 'http://maintainerr.local',
      apikey: 'saved-api-key',
      media_server_type: 'plex',
    }
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps Save Changes enabled regardless of whether general settings have changed', () => {
    render(<MainSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps Save Changes enabled when clearing saved fields so the user can reset them', () => {
    render(<MainSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    const apiKeyInput = screen.getByLabelText('API key')

    fireEvent.change(apiKeyInput, { target: { value: '' } })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })

  it('saves cleared general settings values as a reset', () => {
    render(<MainSettings />)

    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: '' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    return waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        applicationUrl: '',
        apikey: '',
      })
    })
  })

  it('keeps unsaved hostname changes dirty after regenerating the API key', async () => {
    render(<MainSettings />)

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })
    const hostnameInput = screen.getByLabelText('Hostname')
    const regenerateButton = screen.getByRole('button', {
      name: 'Regenerate API key',
    })

    fireEvent.change(hostnameInput, {
      target: { value: 'http://maintainerr.internal' },
    })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(regenerateButton)

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        apikey: 'generated-api-key',
      })
    })

    expect((saveButton as HTMLButtonElement).disabled).toBe(false)
  })
})
