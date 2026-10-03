import type { MaintainerrMediaStatusDetails } from '@maintainerr/contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  clearMaintainerrStatusDetailsCache,
  invalidateMaintainerrStatusDetails,
  loadMaintainerrStatusDetails,
} from './maintainerrStatus'

const asApiHandler = <T>(
  handler: (path: string) => Promise<T>,
): (<Response = unknown>(url: string) => Promise<Response>) => {
  return handler as unknown as <Response = unknown>(
    url: string,
  ) => Promise<Response>
}

describe('maintainerrStatus', () => {
  it('expires cached details after the ttl elapses', async () => {
    clearMaintainerrStatusDetailsCache()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T00:00:00.000Z'))

    const response: MaintainerrMediaStatusDetails = {
      excludedFrom: [{ label: 'Global' }],
      manuallyAddedTo: [],
    }

    const getApiHandler = asApiHandler(
      vi.fn(async (path: string) => {
        if (path === '/media-server/meta/1/maintainerr-status') {
          return response
        }

        throw new Error(`Unexpected request: ${path}`)
      }),
    )

    await loadMaintainerrStatusDetails({
      cacheKey: '1',
      id: 1,
      getApiHandler,
    })

    vi.setSystemTime(new Date('2026-04-04T00:05:01.000Z'))

    await loadMaintainerrStatusDetails({
      cacheKey: '1',
      id: 1,
      getApiHandler,
    })

    expect(getApiHandler).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('invalidates only the targeted key, leaving other cached entries intact', async () => {
    clearMaintainerrStatusDetailsCache()

    const response1: MaintainerrMediaStatusDetails = {
      excludedFrom: [{ label: 'Global' }],
      manuallyAddedTo: [],
    }
    const response2: MaintainerrMediaStatusDetails = {
      excludedFrom: [],
      manuallyAddedTo: [{ label: 'Other Collection' }],
    }

    const getApiHandler = asApiHandler(
      vi.fn(async (path: string) => {
        if (path === '/media-server/meta/1/maintainerr-status') return response1
        if (path === '/media-server/meta/2/maintainerr-status') return response2
        throw new Error(`Unexpected request: ${path}`)
      }),
    )

    await loadMaintainerrStatusDetails({ cacheKey: '1', id: 1, getApiHandler })
    await loadMaintainerrStatusDetails({ cacheKey: '2', id: 2, getApiHandler })

    invalidateMaintainerrStatusDetails(1)

    // item 1: cache was invalidated - must refetch
    await loadMaintainerrStatusDetails({ cacheKey: '1', id: 1, getApiHandler })
    // item 2: cache is still valid - no extra fetch
    await loadMaintainerrStatusDetails({ cacheKey: '2', id: 2, getApiHandler })

    expect(getApiHandler).toHaveBeenCalledTimes(3)
  })
})
