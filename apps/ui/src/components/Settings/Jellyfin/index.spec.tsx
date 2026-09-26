import { fireEvent, render, screen, waitFor } from '../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import JellyfinSettings from './index'

const saveSettingsMock = vi.fn()
const testMock = vi.fn()
const showUpdated = vi.fn()
const showUpdateError = vi.fn()
const showError = vi.fn()
const clear = vi.fn()

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
    mutateAsync: testMock,
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
    clear,
  }),
}))

vi.mock('../../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

describe('JellyfinSettings', () => {
  beforeEach(() => {
    saveSettingsMock.mockReset()
    testMock.mockReset()
    clear.mockReset()
    showUpdated.mockReset()
    showUpdateError.mockReset()
    showError.mockReset()
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

  it('shows the result of a test run after saving in place of "Saved"', async () => {
    testMock.mockResolvedValue({ code: 1, version: '10.11.0' })

    render(<JellyfinSettings />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Test Connection' }),
    )

    expect(await screen.findByText('Success! (10.11.0)')).toBeTruthy()
    expect(clear).toHaveBeenCalled()
  })
})
