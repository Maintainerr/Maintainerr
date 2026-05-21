import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EmbySettings from './index'

const saveSettingsMock = vi.fn()
const showUpdated = vi.fn()
const showUpdateError = vi.fn()
const showError = vi.fn()
const clearError = vi.fn()

vi.mock('..', () => ({
  useSettingsOutletContext: () => ({
    settings: {
      emby_user_id: '',
    },
  }),
}))

vi.mock('../../../api/settings', () => ({
  useEmbySettings: () => ({
    data: {
      emby_url: 'http://emby.local:8096',
      emby_api_key: 'saved-key',
      emby_user_id: '',
    },
  }),
  useTestEmby: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveEmbySettings: () => ({
    mutateAsync: saveSettingsMock,
    isPending: false,
  }),
  useDeleteEmbySettings: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('../useSettingsFeedback', () => ({
  useSettingsFeedback: () => ({
    feedback: null,
    showUpdated,
    showUpdateError,
    showError,
    clearError,
  }),
}))

vi.mock('../../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

vi.mock('../../Login/Emby/EmbyLoginButton', () => ({
  default: () => <button type="button">Sign in with Emby</button>,
}))

describe('EmbySettings', () => {
  beforeEach(() => {
    cleanup()
    saveSettingsMock.mockReset()
    showUpdated.mockReset()
    showUpdateError.mockReset()
    showError.mockReset()
    clearError.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('surfaces backend validation failures instead of showing a success message', async () => {
    saveSettingsMock.mockRejectedValue(
      new Error(
        'Selected Emby user must be an admin. Re-test the connection and pick a valid admin.',
      ),
    )

    render(<EmbySettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        'Selected Emby user must be an admin. Re-test the connection and pick a valid admin.',
      )
    })

    expect(showUpdated).not.toHaveBeenCalled()
    expect(showUpdateError).not.toHaveBeenCalled()
  })
})
