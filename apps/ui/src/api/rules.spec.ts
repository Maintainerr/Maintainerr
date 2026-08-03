import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postBulkExclusions } from './rules'
import { PostApiHandler } from '../utils/ApiHandler'

vi.mock('../utils/ApiHandler', () => ({
  default: vi.fn(),
  PostApiHandler: vi.fn(),
  PutApiHandler: vi.fn(),
}))

const postMock = vi.mocked(PostApiHandler)

const ids = (count: number, prefix = 'item') =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i}`)

describe('postBulkExclusions', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('aggregates per-item results across request chunks', async () => {
    postMock.mockImplementation(async (_path, body) => ({
      results: (body as { mediaIds: string[] }).mediaIds.map((mediaId) => ({
        mediaId,
        code: 1 as const,
      })),
    }))

    const response = await postBulkExclusions(ids(26))

    expect(postMock).toHaveBeenCalledTimes(2)
    expect(postMock.mock.calls[0][1]).toEqual({
      mediaIds: ids(26).slice(0, 25),
    })
    expect(postMock.mock.calls[1][1]).toEqual({ mediaIds: ids(26).slice(25) })
    expect(response.results).toHaveLength(26)
    expect(response.results.every((result) => result.code === 1)).toBe(true)
  })

  it('keeps persisted results and fails the rest when a chunk request throws', async () => {
    postMock
      .mockImplementationOnce(async (_path, body) => ({
        results: (body as { mediaIds: string[] }).mediaIds.map((mediaId) => ({
          mediaId,
          code: 1 as const,
        })),
      }))
      .mockRejectedValueOnce(new Error('boom'))

    const response = await postBulkExclusions(ids(60))

    // chunk 1 persisted, chunk 2 threw, chunk 3 never attempted
    expect(postMock).toHaveBeenCalledTimes(2)
    expect(response.results).toHaveLength(60)
    expect(
      response.results.slice(0, 25).every((result) => result.code === 1),
    ).toBe(true)
    expect(
      response.results
        .slice(25)
        .every(
          (result) =>
            result.code === 0 && result.message === 'Failed - request error',
        ),
    ).toBe(true)
  })
})
