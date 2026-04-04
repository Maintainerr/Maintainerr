import type { MaintainerrMediaStatusDetails } from '@maintainerr/contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  clearMaintainerrStatusDetailsCache,
  emptyMaintainerrMediaStatusDetails,
  fetchMaintainerrStatusDetails,
  getMaintainerrStatusDetailsKey,
  hasMaintainerrStatusDetails,
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
  it('builds status keys only for maintainerr-managed items', () => {
    expect(
      getMaintainerrStatusDetailsKey({
        id: 1,
      }),
    ).toBeUndefined()

    expect(
      getMaintainerrStatusDetailsKey({
        id: 1,
        exclusionType: 'global',
      }),
    ).toBe('1')

    expect(
      getMaintainerrStatusDetailsKey({
        id: 1,
        isManual: true,
      }),
    ).toBe('1')
  })

  it('detects when maintainerr details should be shown', () => {
    expect(
      hasMaintainerrStatusDetails(emptyMaintainerrMediaStatusDetails),
    ).toBe(false)
    expect(
      hasMaintainerrStatusDetails({
        excludedFrom: [{ label: 'Global' }],
        manuallyAddedTo: [],
      }),
    ).toBe(true)
  })

  it('loads maintainerr status details from the media-server endpoint', async () => {
    const response: MaintainerrMediaStatusDetails = {
      excludedFrom: [{ label: 'Global' }],
      manuallyAddedTo: [
        {
          label: 'Testing (5d left)',
          targetPath: '/collections/7',
        },
      ],
    }

    const getApiHandler = asApiHandler(
      vi.fn(async (path: string) => {
        if (path === '/media-server/meta/1/maintainerr-status') {
          return response
        }

        throw new Error(`Unexpected request: ${path}`)
      }),
    )

    await expect(
      fetchMaintainerrStatusDetails({
        id: 1,
        getApiHandler,
      }),
    ).resolves.toEqual(response)
  })

  it('falls back to empty status arrays when the endpoint returns nothing', async () => {
    const getApiHandler = asApiHandler(vi.fn(async () => undefined))

    await expect(
      fetchMaintainerrStatusDetails({
        id: 1,
        getApiHandler,
      }),
    ).resolves.toEqual({
      excludedFrom: [],
      manuallyAddedTo: [],
    })
  })

  it('reuses cached details for repeated modal loads', async () => {
    clearMaintainerrStatusDetailsCache()

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

    await expect(
      loadMaintainerrStatusDetails({
        cacheKey: '1',
        id: 1,
        getApiHandler,
      }),
    ).resolves.toEqual(response)

    await expect(
      loadMaintainerrStatusDetails({
        cacheKey: '1',
        id: 1,
        getApiHandler,
      }),
    ).resolves.toEqual(response)

    expect(getApiHandler).toHaveBeenCalledTimes(1)
  })

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
})
