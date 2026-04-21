import { describe, expect, it } from 'vitest'
import { mapCollectionMediaItemsToMediaData } from './CollectionMediaPage'

describe('CollectionMediaPage', () => {
  it('maps manual state without mutating the original media data objects', () => {
    const sharedMediaData = {
      id: 'episode-1',
      title: 'Episode 1',
      type: 'episode' as const,
      maintainerrIsManual: false,
    }

    const result = mapCollectionMediaItemsToMediaData([
      {
        id: 1,
        collectionId: 7,
        mediaServerId: 'episode-1',
        addDate: new Date('2026-04-20T00:00:00.000Z'),
        isManual: true,
        collection: {} as never,
        mediaData: sharedMediaData,
      },
      {
        id: 2,
        collectionId: 7,
        mediaServerId: 'episode-2',
        addDate: new Date('2026-04-20T00:00:00.000Z'),
        isManual: false,
        collection: {} as never,
        mediaData: sharedMediaData,
      },
    ])

    expect(result[0].maintainerrIsManual).toBe(true)
    expect(result[1].maintainerrIsManual).toBe(false)
    expect(sharedMediaData.maintainerrIsManual).toBe(false)
    expect(result[0]).not.toBe(sharedMediaData)
    expect(result[1]).not.toBe(sharedMediaData)
  })
})
