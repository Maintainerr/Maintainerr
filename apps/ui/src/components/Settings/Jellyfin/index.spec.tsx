import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeavingSoonMethod } from '@maintainerr/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    saveSettingsMock.mockReset()
    showUpdated.mockReset()
    showUpdateError.mockReset()
    showError.mockReset()
    clearError.mockReset()
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

  it('renders the leaving-soon method selector with both options', async () => {
    render(<JellyfinSettings />)

    const select = screen.getByLabelText(
      'Leaving Soon collections',
    ) as HTMLSelectElement
    expect(
      Array.from(select.querySelectorAll('option')).map((o) => o.textContent),
    ).toEqual(['BoxSet collection', 'Leaving Soon plugin library'])
  })

  it('submits the selected leaving-soon method', async () => {
    saveSettingsMock.mockResolvedValue(undefined)
    render(<JellyfinSettings />)

    fireEvent.change(screen.getByLabelText('Leaving Soon collections'), {
      target: { value: LeavingSoonMethod.PLUGIN },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          leaving_soon_method: LeavingSoonMethod.PLUGIN,
        }),
      )
    })
  })
})
