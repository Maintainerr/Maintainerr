import { DEFAULT_OVERLAY_SETTINGS } from '@maintainerr/contracts'
import { fireEvent, render, screen, waitFor } from '../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverlaySettings from './index'

const getOverlaySettings = vi.fn()
const processAllOverlays = vi.fn()
const resetAllOverlays = vi.fn()
const waitForOverlayRun = vi.fn()
const updateOverlaySettings = vi.fn()
const navigate = vi.fn()

vi.mock('../../../api/overlays', () => ({
  getOverlaySettings: () => getOverlaySettings(),
  processAllOverlays: (options?: { force?: boolean }) =>
    processAllOverlays(options),
  resetAllOverlays: () => resetAllOverlays(),
  waitForOverlayRun: () => waitForOverlayRun(),
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
    waitForOverlayRun.mockReset()
    updateOverlaySettings.mockReset()
    navigate.mockReset()

    getOverlaySettings.mockResolvedValue({
      ...DEFAULT_OVERLAY_SETTINGS,
      enabled: true,
      cronSchedule: '0 2 * * *',
    })
    processAllOverlays.mockResolvedValue(undefined)
    resetAllOverlays.mockResolvedValue(undefined)
    waitForOverlayRun.mockResolvedValue({
      status: 'idle',
      lastRun: '2026-08-19T00:00:00.000Z',
      lastResult: { processed: 3, reverted: 1, skipped: 2, errors: 0 },
    })
    updateOverlaySettings.mockImplementation(async (payload) => payload)
  })

  it('runs a forced manual overlay pass from Run Now', async () => {
    render(<OverlaySettings />)

    const runNow = await screen.findByRole('button', { name: 'Run Now' })
    // Run Now stays disabled until the server's enabled state finishes loading;
    // clicking a disabled button is a no-op, so wait for it to enable first.
    await waitFor(() =>
      expect((runNow as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(runNow)

    await waitFor(() => {
      expect(processAllOverlays).toHaveBeenCalledWith({ force: true })
    })

    expect(
      await screen.findByText(
        'Processed: 3, Reverted: 1, Skipped: 2, Errors: 0',
      ),
    ).toBeTruthy()
  })

  it('shows why a manual run was refused instead of a generic failure', async () => {
    processAllOverlays.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: 'Overlay processing is already running' },
        },
      }),
    )

    render(<OverlaySettings />)

    const runNow = await screen.findByRole('button', { name: 'Run Now' })
    await waitFor(() =>
      expect((runNow as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(runNow)

    expect(
      await screen.findByText('Overlay processing is already running'),
    ).toBeTruthy()
  })

  it('reports the reset only once the run it started has finished', async () => {
    render(<OverlaySettings />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Reset All Overlays' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }))

    await waitFor(() => expect(resetAllOverlays).toHaveBeenCalled())
    expect(waitForOverlayRun).toHaveBeenCalled()
    expect(await screen.findByText('All overlays have been reset')).toBeTruthy()
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
