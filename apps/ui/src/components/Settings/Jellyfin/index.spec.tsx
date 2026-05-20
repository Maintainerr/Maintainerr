import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JellyfinSettings from './index'

const saveSettingsMock = vi.fn()
const showUpdated = vi.fn()
const showUpdateError = vi.fn()
const showError = vi.fn()
const clearError = vi.fn()

vi.mock('..', () => ({
  useSettingsOutletContext: () => ({
    settings: {
      jellyfin_user_id: '',
    },
  }),
}))

vi.mock('../../../api/settings', () => ({
  useJellyfinSettings: () => ({
    data: {
      jellyfin_url: 'http://jellyfin.local:8096',
      jellyfin_api_key: 'saved-key',
      jellyfin_user_id: '',
    },
  }),
  useTestJellyfin: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveJellyfinSettings: () => ({
    mutateAsync: saveSettingsMock,
    isPending: false,
  }),
  useDeleteJellyfinSettings: () => ({
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

describe('JellyfinSettings', () => {
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
        'Selected Jellyfin user must be an admin. Please re-test connection and select a valid admin.',
      ),
    )

    render(<JellyfinSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        'Selected Jellyfin user must be an admin. Please re-test connection and select a valid admin.',
      )
    })

    expect(showUpdated).not.toHaveBeenCalled()
    expect(showUpdateError).not.toHaveBeenCalled()
  })
})
