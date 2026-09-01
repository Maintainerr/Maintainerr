import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postBulkCollectionMedia, postBulkExclusions } from './bulkMediaAction'
import { PostApiHandler } from '../utils/ApiHandler'

vi.mock('../utils/ApiHandler', () => ({
  default: vi.fn(),
  PostApiHandler: vi.fn(),
  PutApiHandler: vi.fn(),
}))

const postMock = vi.mocked(PostApiHandler)

const ids = (count: number, prefix = 'item') =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i}`)

const echoIds = async (_path: string, body: unknown) => ({
  results: (body as { mediaIds: string[] }).mediaIds.map((mediaId) => ({
    mediaId,
    code: 1 as const,
  })),
})

describe('postBulkExclusions', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('aggregates per-item results across request chunks', async () => {
    postMock.mockImplementation(echoIds)

    const response = await postBulkExclusions({
      mediaIds: ids(26),
      action: 0,
    })

    expect(postMock).toHaveBeenCalledTimes(2)
    expect(postMock.mock.calls[0][1]).toEqual({
      mediaIds: ids(26).slice(0, 25),
      action: 0,
    })
    expect(postMock.mock.calls[1][1]).toEqual({
      mediaIds: ids(26).slice(25),
      action: 0,
    })
    expect(response.results).toHaveLength(26)
    expect(response.results.every((result) => result.code === 1)).toBe(true)
  })

  it('keeps persisted results and fails the rest when a chunk request throws', async () => {
    postMock.mockImplementationOnce(echoIds).mockRejectedValueOnce(new Error())

    const response = await postBulkExclusions({ mediaIds: ids(60), action: 0 })

    // chunk 1 persisted, chunk 2 threw, chunk 3 never attempted
    expect(postMock).toHaveBeenCalledTimes(2)
    expect(response.results).toHaveLength(60)
    expect(
      response.results.slice(0, 25).every((result) => result.code === 1),
    ).toBe(true)
    expect(
      response.results
        .slice(25, 50)
        .every(
          (result) => result.code === 0 && result.message === 'request error',
        ),
    ).toBe(true)
    // The last chunk was never sent, so it did not fail for that reason.
    expect(
      response.results
        .slice(50)
        .every(
          (result) => result.code === 0 && result.message === 'not attempted',
        ),
    ).toBe(true)
  })

  it('reports the reason the server gave instead of a single catch-all', async () => {
    // A lock conflict and a dropped connection both used to read "request
    // error". The server's own message is the honest answer for the one that
    // has it.
    postMock.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        toJSON: () => ({}),
        response: {
          status: 409,
          data: {
            message:
              'A collection or rule run held the execution lock too long',
          },
        },
      }),
    )

    const response = await postBulkExclusions({ mediaIds: ids(25), action: 0 })

    expect(response.results).toHaveLength(25)
    expect(response.results[0].code).toBe(0)
    expect(response.results[0].message).toBe(
      'A collection or rule run held the execution lock too long',
    )
  })

  it('does not invent a timeout budget the request never had', async () => {
    // The connection-test vocabulary says "timed out after 5 seconds"; this
    // path sets no axios timeout, so that number would be untrue.
    postMock.mockRejectedValueOnce(
      Object.assign(new Error('timeout of 30000ms exceeded'), {
        isAxiosError: true,
        toJSON: () => ({}),
      }),
    )

    const response = await postBulkExclusions({ mediaIds: ids(25), action: 0 })

    expect(response.results[0].message).not.toContain('5 seconds')
  })

  it('carries the collection through every chunk so the scope never changes mid-run', async () => {
    postMock.mockImplementation(echoIds)

    await postBulkExclusions({ mediaIds: ids(26), collectionId: 7, action: 1 })

    expect(
      postMock.mock.calls.every(
        (call) =>
          (call[1] as { collectionId?: number; action: number })
            .collectionId === 7 && (call[1] as { action: number }).action === 1,
      ),
    ).toBe(true)
  })
})

describe('postBulkCollectionMedia', () => {
  beforeEach(() => {
    postMock.mockReset()
  })

  it('chunks the selection and carries the collection and media type', async () => {
    postMock.mockImplementation(echoIds)

    const response = await postBulkCollectionMedia({
      mediaIds: ids(26),
      collectionId: 7,
      action: 0,
      mediaType: 'movie',
    })

    expect(postMock).toHaveBeenCalledTimes(2)
    expect(postMock.mock.calls[0][0]).toBe('/collections/media/bulk')
    expect(postMock.mock.calls[0][1]).toEqual({
      mediaIds: ids(26).slice(0, 25),
      collectionId: 7,
      action: 0,
      mediaType: 'movie',
    })
    expect(response.results).toHaveLength(26)
  })
})
