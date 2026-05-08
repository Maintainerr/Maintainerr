import {
  compareMediaItemsBySort,
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
) =>
  [...items]
    .sort((leftItem, rightItem) =>
      compareMediaItemsBySort(leftItem, rightItem, sort, order),
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
