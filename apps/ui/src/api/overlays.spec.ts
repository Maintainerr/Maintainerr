import { beforeEach, describe, expect, it, vi } from 'vitest'
import GetApiHandler from '../utils/ApiHandler'
import { waitForOverlayRun } from './overlays'

vi.mock('../utils/ApiHandler', () => ({
  default: vi.fn(),
  API_BASE_PATH: '',
  DeleteApiHandler: vi.fn(),
  PostApiHandler: vi.fn(),
  PutApiHandler: vi.fn(),
}))

const getMock = vi.mocked(GetApiHandler)

const status = (state: 'idle' | 'running' | 'error', reverted = 0) => ({
  status: state,
  lastRun: '2026-08-19T00:00:00.000Z',
  lastResult: { processed: 0, reverted, skipped: 0, errors: 0 },
})

describe('waitForOverlayRun', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getMock.mockReset()
  })

  it('polls until the run is no longer in progress, then answers its summary', async () => {
    getMock
      .mockResolvedValueOnce(status('running'))
      .mockResolvedValueOnce(status('running'))
      .mockResolvedValueOnce(status('idle', 6))

    const pending = waitForOverlayRun()
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({
      status: 'idle',
      lastResult: { reverted: 6 },
    })
    expect(getMock).toHaveBeenCalledTimes(3)
  })

  it('stops on a failed run rather than polling forever', async () => {
    getMock.mockResolvedValueOnce(status('error'))

    await expect(waitForOverlayRun()).resolves.toMatchObject({
      status: 'error',
    })
    expect(getMock).toHaveBeenCalledTimes(1)
  })
})
