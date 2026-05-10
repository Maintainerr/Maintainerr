import {
  compareMediaItemsBySort,
  type CompareMediaItemsOptions,
  type MediaItem,
} from '@maintainerr/contracts';

const item = (overrides: Partial<MediaItem>): MediaItem =>
  ({
    id: overrides.id ?? overrides.title ?? 'item',
    title: overrides.title ?? 'item',
    type: 'movie',
    addedAt: new Date('2024-01-01'),
    ...overrides,
  }) as MediaItem;

const sortBy = (
  items: MediaItem[],
  sort: Parameters<typeof compareMediaItemsBySort>[2],
  order: Parameters<typeof compareMediaItemsBySort>[3] = 'asc',
  options?: CompareMediaItemsOptions,
) =>
  [...items]
    .sort((leftItem, rightItem) =>
      compareMediaItemsBySort(leftItem, rightItem, sort, order, options),
    )
    .map((mediaItem) => mediaItem.title);

describe('compareMediaItemsBySort tiebreakers', () => {
  it('breaks deleteSoonest ties alphabetically by title (timelordx scenario)', () => {
    const day3 = new Date('2024-01-01');
    const day5 = new Date('2024-01-03');
    const items: MediaItem[] = [
      item({ title: 'S', addedAt: day3 }),
      item({ title: 'H', addedAt: day3 }),
      item({ title: 'G', addedAt: day3 }),
      item({ title: 'X', addedAt: day3 }),
      item({ title: 'C', addedAt: day5 }),
      item({ title: 'Z', addedAt: day5 }),
      item({ title: 'A', addedAt: day5 }),
    ];

    expect(sortBy(items, 'deleteSoonest', 'asc')).toEqual([
      'G',
      'H',
      'S',
      'X',
      'A',
      'C',
      'Z',
    ]);
  });

  it('breaks airDate ties alphabetically by title regardless of direction', () => {
    const sharedDate = new Date('2024-06-01');
    const items: MediaItem[] = [
      item({ title: 'C', originallyAvailableAt: sharedDate }),
      item({ title: 'A', originallyAvailableAt: sharedDate }),
      item({ title: 'B', originallyAvailableAt: sharedDate }),
    ];

    expect(sortBy(items, 'airDate', 'asc')).toEqual(['A', 'B', 'C']);
    expect(sortBy(items, 'airDate', 'desc')).toEqual(['A', 'B', 'C']);
  });

  it('breaks rating and watchCount ties alphabetically by title', () => {
    const ratings: MediaItem[] = [
      item({
        title: 'C',
        ratings: [{ type: 'audience', value: 7, source: 'audience' }],
      }),
      item({
        title: 'A',
        ratings: [{ type: 'audience', value: 7, source: 'audience' }],
      }),
      item({
        title: 'B',
        ratings: [{ type: 'audience', value: 9, source: 'audience' }],
      }),
    ];
    expect(sortBy(ratings, 'rating', 'desc')).toEqual(['B', 'A', 'C']);

    const views: MediaItem[] = [
      item({ title: 'C', viewCount: 0 }),
      item({ title: 'A', viewCount: 0 }),
      item({ title: 'B', viewCount: 0 }),
    ];
    expect(sortBy(views, 'watchCount', 'asc')).toEqual(['A', 'B', 'C']);
  });

  it('does not apply a title tiebreaker to status sorts (manual/excluded)', () => {
    // Status sorts intentionally only partition — incoming order must be
    // preserved within each partition for stable filter UX.
    const items: MediaItem[] = [
      item({ title: 'C', maintainerrIsManual: true }),
      item({ title: 'A', maintainerrIsManual: true }),
      item({ title: 'B', maintainerrIsManual: false }),
    ];

    expect(sortBy(items, 'manual', 'desc')).toEqual(['C', 'A', 'B']);
  });
});

describe('compareMediaItemsBySort show-aware title ordering', () => {
  it('groups episodes from the same show together when sorting by title', () => {
    // Pre-fix the title sort would interleave episodes by episode title
    // (Aurora, Borealis, Comet, Drift) and split episodes from the same
    // show. Show-aware ordering keeps a show's episodes contiguous.
    const items: MediaItem[] = [
      item({
        id: 'ep1',
        title: 'Comet',
        type: 'episode',
        grandparentTitle: 'Show Beta',
      }),
      item({
        id: 'ep2',
        title: 'Aurora',
        type: 'episode',
        grandparentTitle: 'Show Alpha',
      }),
      item({
        id: 'ep3',
        title: 'Drift',
        type: 'episode',
        grandparentTitle: 'Show Beta',
      }),
      item({
        id: 'ep4',
        title: 'Borealis',
        type: 'episode',
        grandparentTitle: 'Show Alpha',
      }),
    ];

    expect(sortBy(items, 'title', 'asc')).toEqual([
      'Aurora',
      'Borealis',
      'Comet',
      'Drift',
    ]);
  });

  it('reverses both show and episode order when sorting title desc', () => {
    const items: MediaItem[] = [
      item({
        id: 'ep1',
        title: 'Comet',
        type: 'episode',
        grandparentTitle: 'Show Beta',
      }),
      item({
        id: 'ep2',
        title: 'Aurora',
        type: 'episode',
        grandparentTitle: 'Show Alpha',
      }),
      item({
        id: 'ep3',
        title: 'Drift',
        type: 'episode',
        grandparentTitle: 'Show Beta',
      }),
      item({
        id: 'ep4',
        title: 'Borealis',
        type: 'episode',
        grandparentTitle: 'Show Alpha',
      }),
    ];

    expect(sortBy(items, 'title', 'desc')).toEqual([
      'Drift',
      'Comet',
      'Borealis',
      'Aurora',
    ]);
  });

  it('leaves movie title ordering unchanged (no parent/grandparent titles)', () => {
    const items: MediaItem[] = [
      item({ title: 'Charlie', type: 'movie' }),
      item({ title: 'Alpha', type: 'movie' }),
      item({ title: 'Bravo', type: 'movie' }),
    ];

    expect(sortBy(items, 'title', 'asc')).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });
});

describe('compareMediaItemsBySort deleteSoonest day bucketing', () => {
  it('treats items added in the same UTC day as ties so the title tiebreaker fires', () => {
    // Same calendar day, hours apart. Pre-fix this would sort strictly by
    // millisecond timestamp and the title tiebreaker would never fire.
    const items: MediaItem[] = [
      item({ title: 'C', addedAt: new Date('2024-01-01T01:00:00Z') }),
      item({ title: 'A', addedAt: new Date('2024-01-01T15:00:00Z') }),
      item({ title: 'B', addedAt: new Date('2024-01-01T08:00:00Z') }),
    ];

    expect(sortBy(items, 'deleteSoonest', 'asc')).toEqual(['A', 'B', 'C']);
    expect(sortBy(items, 'deleteSoonest', 'desc')).toEqual(['A', 'B', 'C']);
  });

  it('still orders separate days by date', () => {
    const items: MediaItem[] = [
      item({ title: 'Day3-A', addedAt: new Date('2024-01-03T22:00:00Z') }),
      item({ title: 'Day1-Z', addedAt: new Date('2024-01-01T02:00:00Z') }),
      item({ title: 'Day2-M', addedAt: new Date('2024-01-02T10:00:00Z') }),
    ];

    expect(sortBy(items, 'deleteSoonest', 'asc')).toEqual([
      'Day1-Z',
      'Day2-M',
      'Day3-A',
    ]);
  });
});

describe('compareMediaItemsBySort deleteSoonest date override', () => {
  it('uses options.deleteSoonestDate over MediaItem.addedAt when provided', () => {
    // Models the collection-media case: MediaItem.addedAt is the library
    // add date (irrelevant to deletion timing), the override carries
    // collection_media.addDate (drives the visible "Leaving in X days").
    const libraryAddDate = new Date('2024-06-01T00:00:00Z');
    const collectionDates = new Map<string, Date>([
      ['leaves-soonest', new Date('2024-01-01T00:00:00Z')],
      ['leaves-middle', new Date('2024-01-15T00:00:00Z')],
      ['leaves-latest', new Date('2024-02-01T00:00:00Z')],
    ]);

    const items: MediaItem[] = [
      item({
        id: 'leaves-latest',
        title: 'Leaves last',
        addedAt: libraryAddDate,
      }),
      item({
        id: 'leaves-soonest',
        title: 'Leaves first',
        addedAt: libraryAddDate,
      }),
      item({
        id: 'leaves-middle',
        title: 'Leaves second',
        addedAt: libraryAddDate,
      }),
    ];

    expect(
      sortBy(items, 'deleteSoonest', 'asc', {
        deleteSoonestDate: (mediaItem) => collectionDates.get(mediaItem.id),
      }),
    ).toEqual(['Leaves first', 'Leaves second', 'Leaves last']);
  });

  it('falls back to MediaItem.addedAt when the override returns undefined', () => {
    const items: MediaItem[] = [
      item({ id: 'a', title: 'A', addedAt: new Date('2024-01-02T00:00:00Z') }),
      item({ id: 'b', title: 'B', addedAt: new Date('2024-01-01T00:00:00Z') }),
    ];

    expect(
      sortBy(items, 'deleteSoonest', 'asc', {
        deleteSoonestDate: () => undefined,
      }),
    ).toEqual(['B', 'A']);
  });
});

describe('compareMediaItemsBySort missing values', () => {
  // Missing-to-end is direction-independent: items without a value cannot be
  // meaningfully placed on a numeric axis, so they always trail real values.
  // Pre-fix they coerced to 0 and silently sorted to the front in 'asc' mode
  // (e.g. an item with no air date appeared before one from 1995).
  it('sorts items without an air date to the end regardless of direction', () => {
    const items: MediaItem[] = [
      item({ title: 'No date 1', originallyAvailableAt: undefined }),
      item({ title: 'New', originallyAvailableAt: new Date('2024-06-01') }),
      item({ title: 'No date 2', originallyAvailableAt: undefined }),
      item({ title: 'Old', originallyAvailableAt: new Date('1995-06-01') }),
    ];

    expect(sortBy(items, 'airDate', 'asc')).toEqual([
      'Old',
      'New',
      'No date 1',
      'No date 2',
    ]);
    expect(sortBy(items, 'airDate', 'desc')).toEqual([
      'New',
      'Old',
      'No date 1',
      'No date 2',
    ]);
  });

  it('sorts items without a rating to the end regardless of direction', () => {
    const items: MediaItem[] = [
      item({ title: 'Unrated', ratings: undefined }),
      item({
        title: 'Mid',
        ratings: [{ type: 'audience', value: 5, source: 'tmdb' }],
      }),
      item({
        title: 'High',
        ratings: [{ type: 'audience', value: 9, source: 'tmdb' }],
      }),
    ];

    expect(sortBy(items, 'rating', 'desc')).toEqual(['High', 'Mid', 'Unrated']);
    expect(sortBy(items, 'rating', 'asc')).toEqual(['Mid', 'High', 'Unrated']);
  });

  it('treats viewCount === 0 as a real value, only undefined trails to the end', () => {
    // Distinguishes "watched zero times" (a real data point) from
    // "watch count not reported" — pre-fix both collapsed to 0.
    const items: MediaItem[] = [
      item({ title: 'Unknown', viewCount: undefined }),
      item({ title: 'Watched', viewCount: 3 }),
      item({ title: 'Never', viewCount: 0 }),
    ];

    expect(sortBy(items, 'watchCount', 'asc')).toEqual([
      'Never',
      'Watched',
      'Unknown',
    ]);
  });

  it('sorts items without a delete-soonest date to the end', () => {
    const items: MediaItem[] = [
      item({ id: 'has-date', title: 'Has date' }),
      item({ id: 'no-date', title: 'No date' }),
    ];

    expect(
      sortBy(items, 'deleteSoonest', 'asc', {
        deleteSoonestDate: (mediaItem) =>
          mediaItem.id === 'has-date' ? new Date('2024-01-01') : undefined,
      }),
    ).toEqual(['Has date', 'No date']);
  });

  it('falls back to title order when both items are missing the value', () => {
    const items: MediaItem[] = [
      item({ title: 'C', originallyAvailableAt: undefined }),
      item({ title: 'A', originallyAvailableAt: undefined }),
      item({ title: 'B', originallyAvailableAt: undefined }),
    ];

    expect(sortBy(items, 'airDate', 'asc')).toEqual(['A', 'B', 'C']);
    expect(sortBy(items, 'airDate', 'desc')).toEqual(['A', 'B', 'C']);
  });
});
