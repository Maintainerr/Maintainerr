import { DEFAULT_OVERLAY_SETTINGS } from '@maintainerr/contracts'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverlaySettings from './index'

const getOverlaySettings = vi.fn()
const processAllOverlays = vi.fn()
const resetAllOverlays = vi.fn()
const updateOverlaySettings = vi.fn()
const navigate = vi.fn()

vi.mock('../../../api/overlays', () => ({
  getOverlaySettings: () => getOverlaySettings(),
  processAllOverlays: (options?: { force?: boolean }) =>
    processAllOverlays(options),
  resetAllOverlays: () => resetAllOverlays(),
  useUpdateOverlaySettings: () => ({
    mutateAsync: updateOverlaySettings,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('OverlaySettings', () => {
  beforeEach(() => {
    getOverlaySettings.mockReset()
    processAllOverlays.mockReset()
    resetAllOverlays.mockReset()
    updateOverlaySettings.mockReset()
    navigate.mockReset()

    getOverlaySettings.mockResolvedValue({
      ...DEFAULT_OVERLAY_SETTINGS,
      enabled: true,
      cronSchedule: '0 2 * * *',
    })
    processAllOverlays.mockResolvedValue({
      processed: 3,
      reverted: 1,
      errors: 0,
    })
    resetAllOverlays.mockResolvedValue({ success: true })
    updateOverlaySettings.mockImplementation(async (payload) => payload)
  })

  afterEach(() => {
    cleanup()
  })

  it('runs a forced manual overlay pass from Run Now', async () => {
    render(<OverlaySettings />)

    const runNow = await screen.findByRole('button', { name: 'Run Now' })
    fireEvent.click(runNow)

    await waitFor(() => {
      expect(processAllOverlays).toHaveBeenCalledWith({ force: true })
    })

    expect(
      await screen.findByText('Processed: 3, Reverted: 1, Errors: 0'),
    ).toBeTruthy()
  })

  it('keeps reset available even when overlays are not enabled on the server', async () => {
    getOverlaySettings.mockResolvedValueOnce({
      ...DEFAULT_OVERLAY_SETTINGS,
      enabled: false,
      cronSchedule: null,
    })

    render(<OverlaySettings />)

    const runNow = await screen.findByRole('button', { name: 'Run Now' })
    const reset = screen.getByRole('button', { name: 'Reset All Overlays' })

    expect((runNow as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Reapply All' })).toBeNull()
    expect((reset as HTMLButtonElement).disabled).toBe(false)
  })
})
