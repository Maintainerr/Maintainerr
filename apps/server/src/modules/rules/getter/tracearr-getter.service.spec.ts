import { TracearrHistoryItem } from '@maintainerr/contracts';
import { Repository } from 'typeorm';
import {
  createCollection,
  createMediaItem,
  createMockLogger,
} from '../../../../test/utils/data';
import {
  TracearrApiService,
  TracearrHistoryIndex,
} from '../../api/tracearr-api/tracearr-api.service';
import { Collection } from '../../collections/entities/collection.entities';
import { RuleGroupDto } from '../dtos/ruleGroup.dto';
import { TracearrGetterService } from './tracearr-getter.service';

const SEEN_BY = 0;
const ALL_EPISODES_SEEN_BY = 1;
const VIEW_COUNT = 3;
const LAST_VIEWED_AT = 4;
const AMOUNT_OF_VIEWS = 5;
const VIEWED_EPISODES = 6;
const LAST_WATCHED = 7;
const WATCHERS = 8;

const USER_ID = '22222222-2222-4222-8222-222222222222';

const historyItem = (
  id: string,
  properties: Partial<TracearrHistoryItem> = {},
): TracearrHistoryItem => ({
  id,
  server_id: '11111111-1111-4111-8111-111111111111',
  server_type: 'jellyfin',
  media_type: 'episode',
  rating_key: 'episode-1',
  parent_rating_key: null,
  grandparent_rating_key: 'show-1',
  season_number: 1,
  episode_number: 1,
  percent_complete: 100,
  watched: true,
  started_at: '2026-01-01T00:00:00.000Z',
  stopped_at: '2026-01-01T01:00:00.000Z',
  user: { id: USER_ID },
  ...properties,
});

const createHistoryIndex = (
  rows: TracearrHistoryItem[],
): TracearrHistoryIndex => {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const rowsByRatingKey = new Map<string, TracearrHistoryItem[]>();
  const rowsByShowRatingKey = new Map<string, TracearrHistoryItem[]>();
  const earliestStartedAt = Math.min(
    ...rows.map((row) => new Date(row.started_at).getTime()),
  );
  const unfinishedChainIds = new Set(
    rows.filter((row) => row.stopped_at == null).map((row) => row.id),
  );

  for (const row of rows) {
    if (row.rating_key) {
      const values = rowsByRatingKey.get(row.rating_key) ?? [];
      values.push(row);
      rowsByRatingKey.set(row.rating_key, values);
    }
    if (row.grandparent_rating_key) {
      const values = rowsByShowRatingKey.get(row.grandparent_rating_key) ?? [];
      values.push(row);
      rowsByShowRatingKey.set(row.grandparent_rating_key, values);
    }
  }

  return {
    rowsById,
    rowsByRatingKey,
    rowsByShowRatingKey,
    earliestStartedAt,
    unfinishedChainIds,
  };
};

const ruleGroup = { collection: { id: 1 } } as RuleGroupDto;

const createService = (
  rows: TracearrHistoryItem[],
  options: {
    watchedPercentOverride?: number | null;
    episodeIds?: string[];
    historyAvailable?: boolean;
  } = {},
) => {
  const tracearrApi = {
    getHistoryIndex: jest
      .fn()
      .mockReturnValue(
        options.historyAvailable === false
          ? undefined
          : createHistoryIndex(rows),
      ),
    prefetchHistory: jest.fn().mockResolvedValue(undefined),
    getUsernamesByTracearrUserId: jest
      .fn()
      .mockReturnValue(new Map([[USER_ID, ['alice']]])),
    getEpisodeIds: jest.fn().mockResolvedValue(options.episodeIds ?? []),
  } as unknown as jest.Mocked<TracearrApiService>;
  const collectionRepository = {
    findOne: jest.fn().mockResolvedValue(
      createCollection({
        tautulliWatchedPercentOverride: options.watchedPercentOverride ?? null,
      }),
    ),
  } as unknown as jest.Mocked<Repository<Collection>>;

  return {
    service: new TracearrGetterService(
      tracearrApi,
      collectionRepository,
      createMockLogger(),
    ),
    tracearrApi,
    collectionRepository,
  };
};

describe('TracearrGetterService', () => {
  const movie = createMediaItem({
    type: 'movie',
    id: 'movie-1',
    addedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const show = createMediaItem({
    type: 'show',
    id: 'show-1',
    addedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const episode = createMediaItem({
    type: 'episode',
    id: 'episode-1',
    parentId: 'season-1',
    grandparentId: 'show-1',
    addedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  it('returns usernames for seenBy', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
      }),
    ]);

    await expect(service.get(SEEN_BY, movie, ruleGroup)).resolves.toEqual([
      'alice',
    ]);
  });

  it('returns users who watched every episode from the media-server catalog', async () => {
    const { service } = createService(
      [
        historyItem('33333333-3333-4333-8333-333333333333', {
          rating_key: 'episode-1',
        }),
        historyItem('44444444-4444-4444-8444-444444444444', {
          rating_key: 'episode-2',
        }),
      ],
      { episodeIds: ['episode-1', 'episode-2'] },
    );

    await expect(
      service.get(ALL_EPISODES_SEEN_BY, show, ruleGroup),
    ).resolves.toEqual(['alice']);
  });

  it('counts watched movie chains for viewCount', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
      }),
      historyItem('44444444-4444-4444-8444-444444444444', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
      }),
    ]);

    await expect(service.get(VIEW_COUNT, movie, ruleGroup)).resolves.toBe(2);
  });

  it('returns the latest watched date for lastViewedAt', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
        stopped_at: '2026-01-02T01:00:00.000Z',
      }),
    ]);

    await expect(
      service.get(LAST_VIEWED_AT, movie, ruleGroup),
    ).resolves.toEqual(new Date('2026-01-02T01:00:00.000Z'));
  });

  it('prefetches and reads a fresh index after Test Media invalidates history', async () => {
    const { service, tracearrApi } = createService([]);
    const freshIndex = createHistoryIndex([
      historyItem('33333333-3333-4333-8333-333333333333', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
      }),
    ]);
    tracearrApi.getHistoryIndex.mockReset();
    tracearrApi.getHistoryIndex
      .mockReturnValueOnce(undefined)
      .mockReturnValue(freshIndex);

    await expect(service.get(VIEW_COUNT, movie, ruleGroup)).resolves.toBe(1);

    expect(tracearrApi.prefetchHistory).toHaveBeenCalledTimes(1);
  });

  it('counts watched episode chains for sw_amountOfViews', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333'),
      historyItem('44444444-4444-4444-8444-444444444444'),
    ]);

    await expect(service.get(AMOUNT_OF_VIEWS, show, ruleGroup)).resolves.toBe(
      2,
    );
  });

  it('counts distinct watched episode keys for sw_viewedEpisodes', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333'),
      historyItem('44444444-4444-4444-8444-444444444444'),
      historyItem('55555555-5555-4555-8555-555555555555', {
        rating_key: 'episode-2',
        episode_number: 2,
      }),
      historyItem('66666666-6666-4666-8666-666666666666', {
        rating_key: null,
        episode_number: 3,
      }),
    ]);

    await expect(service.get(VIEWED_EPISODES, show, ruleGroup)).resolves.toBe(
      2,
    );
  });

  it('returns the latest-numbered watched episode date for sw_lastWatched', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        season_number: 1,
        episode_number: 9,
        stopped_at: '2026-01-04T01:00:00.000Z',
      }),
      historyItem('44444444-4444-4444-8444-444444444444', {
        rating_key: 'episode-2',
        season_number: 2,
        episode_number: 2,
        stopped_at: '2026-01-03T01:00:00.000Z',
      }),
    ]);

    await expect(service.get(LAST_WATCHED, show, ruleGroup)).resolves.toEqual(
      new Date('2026-01-03T01:00:00.000Z'),
    );
  });

  it('ignores watched episodes without season or episode numbers for sw_lastWatched', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        season_number: null,
        episode_number: null,
      }),
      historyItem('44444444-4444-4444-8444-444444444444', {
        rating_key: 'episode-2',
        season_number: 2,
        episode_number: 1,
        stopped_at: '2026-01-03T01:00:00.000Z',
      }),
    ]);

    await expect(service.get(LAST_WATCHED, show, ruleGroup)).resolves.toEqual(
      new Date('2026-01-03T01:00:00.000Z'),
    );
  });

  it('returns usernames who watched at least one episode for sw_watchers', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333'),
    ]);

    await expect(service.get(WATCHERS, show, ruleGroup)).resolves.toEqual([
      'alice',
    ]);
  });

  it('skips user IDs that no longer map to a media-server account', async () => {
    const departedUserId = '77777777-7777-4777-8777-777777777777';
    const { service, tracearrApi } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
      }),
      historyItem('44444444-4444-4444-8444-444444444444', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
        user: { id: departedUserId },
      }),
    ]);
    tracearrApi.getUsernamesByTracearrUserId.mockReturnValue(
      new Map([[USER_ID, ['alice']]]),
    );

    await expect(service.get(SEEN_BY, movie, ruleGroup)).resolves.toEqual([
      'alice',
    ]);
  });

  it('uses the collection watched-percent override instead of Tracearr watched', async () => {
    const { service } = createService(
      [
        historyItem('33333333-3333-4333-8333-333333333333', {
          media_type: 'movie',
          rating_key: 'movie-1',
          grandparent_rating_key: null,
          watched: false,
          percent_complete: 70,
        }),
      ],
      { watchedPercentOverride: 60 },
    );

    await expect(service.get(VIEW_COUNT, movie, ruleGroup)).resolves.toBe(1);
  });

  it('loads a collection watched-percent override once per snapshot', async () => {
    const { service, collectionRepository } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        media_type: 'movie',
        rating_key: 'movie-1',
        grandparent_rating_key: null,
      }),
    ]);

    await service.get(VIEW_COUNT, movie, ruleGroup);
    await service.get(LAST_VIEWED_AT, movie, ruleGroup);

    expect(collectionRepository.findOne).toHaveBeenCalledTimes(1);
  });

  it('treats an episode omitted by Tracearrs two-minute floor as unviewed', async () => {
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        rating_key: 'another-episode',
      }),
    ]);

    await expect(service.get(VIEW_COUNT, movie, ruleGroup)).resolves.toBe(0);
  });

  it('skips unobserved media added before Tracearr history begins', async () => {
    const olderMovie = createMediaItem({
      type: 'movie',
      id: 'movie-1',
      addedAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        rating_key: 'another-episode',
      }),
    ]);

    await expect(
      service.get(VIEW_COUNT, olderMovie, ruleGroup),
    ).resolves.toBeUndefined();
  });

  it('scopes Jellyfin and Emby season rows by show key and season number', async () => {
    const season = createMediaItem({
      type: 'season',
      id: 'season-2',
      parentId: 'show-1',
      index: 2,
    });
    const { service } = createService([
      historyItem('33333333-3333-4333-8333-333333333333', {
        parent_rating_key: null,
        season_number: 2,
      }),
    ]);

    await expect(service.get(AMOUNT_OF_VIEWS, season, ruleGroup)).resolves.toBe(
      1,
    );
  });

  it.each([
    ALL_EPISODES_SEEN_BY,
    AMOUNT_OF_VIEWS,
    VIEWED_EPISODES,
    LAST_WATCHED,
    WATCHERS,
    // A property that does not apply to this item type answers null, the
    // definitive "does not apply". The transient signal froze the whole group,
    // because the executor sweeps a library at a single dataType.
  ])('skips show property %i for a movie', async (propertyId) => {
    const { service, tracearrApi } = createService([]);

    await expect(service.get(propertyId, movie, ruleGroup)).resolves.toBeNull();
    expect(tracearrApi.prefetchHistory).not.toHaveBeenCalled();
  });

  it.each([SEEN_BY, VIEW_COUNT])(
    'skips movie property %i for an episode',
    async (propertyId) => {
      const { service, tracearrApi } = createService([]);

      await expect(
        service.get(propertyId, episode, ruleGroup),
      ).resolves.toBeNull();
      expect(tracearrApi.prefetchHistory).not.toHaveBeenCalled();
    },
  );

  it.each([
    { propertyId: SEEN_BY, libItem: movie },
    { propertyId: ALL_EPISODES_SEEN_BY, libItem: show },
    { propertyId: VIEW_COUNT, libItem: movie },
    { propertyId: LAST_VIEWED_AT, libItem: show },
    { propertyId: AMOUNT_OF_VIEWS, libItem: show },
    { propertyId: VIEWED_EPISODES, libItem: show },
    { propertyId: LAST_WATCHED, libItem: show },
    { propertyId: WATCHERS, libItem: show },
  ])(
    'returns undefined for property $propertyId when the index is unavailable',
    async ({ propertyId, libItem }) => {
      const { service, tracearrApi } = createService([], {
        historyAvailable: false,
      });

      await expect(
        service.get(propertyId, libItem, ruleGroup),
      ).resolves.toBeUndefined();
      expect(tracearrApi.prefetchHistory).toHaveBeenCalledTimes(1);
    },
  );
});
