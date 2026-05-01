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

  it('runs the standard manual overlay pass without force', async () => {
    render(<OverlaySettings />)

    const runNow = await screen.findByRole('button', { name: 'Run Now' })
    fireEvent.click(runNow)

    await waitFor(() => {
      expect(processAllOverlays).toHaveBeenCalledWith(undefined)
    })

    expect(
      await screen.findByText('Processed: 3, Reverted: 1, Errors: 0'),
    ).toBeTruthy()
  })

  it('runs a forced manual overlay reapply pass', async () => {
    render(<OverlaySettings />)

    const reapply = await screen.findByRole('button', { name: 'Reapply All' })
    fireEvent.click(reapply)

    await waitFor(() => {
      expect(processAllOverlays).toHaveBeenCalledWith({ force: true })
    })
  })

  it('disables manual actions when overlays are not enabled on the server', async () => {
    getOverlaySettings.mockResolvedValueOnce({
      ...DEFAULT_OVERLAY_SETTINGS,
      enabled: false,
      cronSchedule: null,
    })

    render(<OverlaySettings />)

    const runNow = await screen.findByRole('button', { name: 'Run Now' })
    const reapply = screen.getByRole('button', { name: 'Reapply All' })
    const reset = screen.getByRole('button', { name: 'Reset All Overlays' })

    expect((runNow as HTMLButtonElement).disabled).toBe(true)
    expect((reapply as HTMLButtonElement).disabled).toBe(true)
    expect((reset as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows visible copy that distinguishes process, reapply, and reset behavior', async () => {
    render(<OverlaySettings />)

    expect(await screen.findByText('Action meanings')).toBeTruthy()
    expect(
      screen.getByText(/process overlays normally and skip items/i),
    ).toBeTruthy()
    expect(
      screen.getByText(
        /rebuild existing overlays using the current templates/i,
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(/restore the original artwork and clear overlay state/i),
    ).toBeTruthy()
  })
})
