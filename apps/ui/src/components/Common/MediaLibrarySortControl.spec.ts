import { describe, expect, it } from 'vitest'
import {
  getCollectionMediaSortConfig,
  getMediaLibrarySortConfig,
  getCollectionSortConfig,
} from './MediaLibrarySortControl'

const statusSortValues = ['manual.desc', 'excluded.desc']

const valuesOf = (options: ReadonlyArray<{ value: string }>) =>
  options.map((option) => option.value)

describe('getCollectionMediaSortConfig', () => {
  it('offers the status sorts to the collection media page', () => {
    const values = valuesOf(
      getCollectionMediaSortConfig('movie', true, false, true).options,
    )

    expect(values).toEqual(expect.arrayContaining(statusSortValues))
  })

  // The rule group form persists its selection as the order pushed to the media
  // server, and that path resolves media-server metadata without Maintainerr
  // state - so every comparison would tie and the remote collection would be
  // reordered arbitrarily. It calls this with the status sorts left off.
  it('withholds them from the persisted media server sort selector', () => {
    const values = valuesOf(getCollectionMediaSortConfig('movie', true).options)

    statusSortValues.forEach((value) => expect(values).not.toContain(value))
  })

  // The exclusions tab shares the config this builds on and lists nothing but
  // exclusions, so "Excluded First" would be meaningless there.
  it('keeps them out of the shared collection config', () => {
    const values = valuesOf(getCollectionSortConfig('movie').options)

    statusSortValues.forEach((value) => expect(values).not.toContain(value))
  })

  it('offers the studio sorts only when the media server can sort by studio', () => {
    expect(
      valuesOf(getCollectionMediaSortConfig('movie', true, true, true).options),
    ).toEqual(expect.arrayContaining(['studio.asc', 'studio.desc']))
    expect(
      valuesOf(
        getCollectionMediaSortConfig('movie', true, false, true).options,
      ),
    ).not.toContain('studio.asc')
  })
})

describe('Overview size sort', () => {
  it('offers both size directions only on Overview, not the collection or rule selectors', () => {
    const overview = valuesOf(getMediaLibrarySortConfig('movie').options)
    const collection = valuesOf(getCollectionMediaSortConfig('movie').options)
    const sizeOptions = ['size.desc', 'size.asc']

    expect(overview).toEqual(expect.arrayContaining(sizeOptions))
    sizeOptions.forEach((value) => expect(collection).not.toContain(value))
  })
})
