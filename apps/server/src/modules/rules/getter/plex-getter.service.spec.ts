import { MediaItem } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import { createMediaItem, createRulesDto } from '../../../../test/utils/data';
import { PlexAdapterService } from '../../api/media-server/plex/plex-adapter.service';
import {
  PlexCollection,
  PlexPlaylist,
} from '../../api/plex-api/interfaces/collection.interface';
import {
  PlexLibraryItem,
  PlexSeenBy,
  SimplePlexUser,
} from '../../api/plex-api/interfaces/library.interfaces';
import {
  Media,
  PlexMetadata,
} from '../../api/plex-api/interfaces/media.interface';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { PlexGetterService } from './plex-getter.service';

const SEEN_BY_PROP_ID = 1;
const VIEWCOUNT_PROP_ID = 5;
const ISWATCHED_PROP_ID = 43;
const PLEX_ITEM_ID = 'plex-item-123';

const makeMedia = (overrides: Partial<Media> = {}): Media => ({
  id: 1,
  duration: 7_200_000,
  bitrate: 12_000,
  width: 1920,
  height: 1080,
  aspectRatio: 1.78,
  audioChannels: 6,
  audioCodec: 'aac',
  videoCodec: 'h264',
  videoResolution: '1080',
  container: 'mkv',
  videoFrameRate: '24p',
  videoProfile: 'high',
  ...overrides,
});

const makeMetadata = (overrides: Partial<PlexMetadata> = {}): PlexMetadata => ({
  ratingKey: '12345',
  guid: 'plex://movie/movieuuid',
  type: 'movie',
  title: 'Fixture Movie',
  Guid: [],
  index: 1,
  leafCount: 0,
  viewedLeafCount: 0,
  addedAt: 1_700_000_000,
  updatedAt: 1_700_000_100,
  media: [],
  Media: [makeMedia()],
  originallyAvailableAt: '2024-01-01',
  ...overrides,
});

const makeLibraryItem = (
  overrides: Partial<PlexLibraryItem> = {},
): PlexLibraryItem => ({
  ratingKey: 'child-1',
  title: 'Child Item',
  guid: 'plex://movie/childuuid',
  addedAt: 1_700_000_000,
  updatedAt: 1_700_000_100,
  type: 'movie',
  Media: [makeMedia()],
  librarySectionTitle: 'Movies',
  librarySectionID: 1,
  librarySectionKey: '1',
  summary: 'Child summary',
  viewCount: 0,
  skipCount: 0,
  lastViewedAt: 0,
  year: 2024,
  duration: 7_200_000,
  originallyAvailableAt: '2024-01-01',
  ...overrides,
});

const makeWatchEntry = (overrides: Partial<PlexSeenBy> = {}): PlexSeenBy => ({
  ...makeLibraryItem(),
  historyKey: 'history-1',
  key: '/library/metadata/history-1',
  ratingKey: '12345',
  title: 'Fixture Movie',
  thumb: '/thumb.jpg',
  viewedAt: 1_700_010_000,
  accountID: 1,
  deviceID: 1,
  ...overrides,
});

const makePlexUser = (
  overrides: Partial<SimplePlexUser> = {},
): SimplePlexUser => ({
  plexId: 1,
  username: 'alice',
  ...overrides,
});

const makeCollection = (
  overrides: Partial<PlexCollection> = {},
): PlexCollection => ({
  ratingKey: 'collection-1',
  key: '/library/collections/collection-1',
  guid: 'plex://collection/collectionuuid',
  type: 'collection',
  title: 'Fixture Collection',
  subtype: 'movie',
  summary: 'Collection summary',
  index: 1,
  ratingCount: 1,
  thumb: '/collection.jpg',
  addedAt: 1_700_000_000,
  updatedAt: 1_700_000_100,
  childCount: '1',
  maxYear: '2024',
  minYear: '2024',
  ...overrides,
});

const makePlaylist = (overrides: Partial<PlexPlaylist> = {}): PlexPlaylist => ({
  ratingKey: 'playlist-1',
  key: '/playlists/playlist-1/items',
  guid: 'plex://playlist/playlistuuid',
  type: 'playlist',
  title: 'Fixture Playlist',
  summary: 'Playlist summary',
  smart: false,
  playlistType: 'video',
  composite: '/composite.jpg',
  viewCount: 0,
  lastViewedAt: 0,
  duration: 7_200_000,
  leafCount: 1,
  addedAt: 1_700_000_000,
  updatedAt: 1_700_000_100,
  itemCount: 1,
  ...overrides,
});

describe('PlexGetterService', () => {
  let service: PlexGetterService;
  let plexApi: Mocked<PlexApiService>;
  let plexAdapter: Mocked<PlexAdapterService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(PlexGetterService).compile();

    service = unit;
    plexApi = unitRef.get(PlexApiService);
    plexAdapter = unitRef.get(PlexAdapterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('watch state rules', () => {
    let libItem: MediaItem;

    beforeEach(() => {
      libItem = createMediaItem({ type: 'movie', viewCount: 0 });
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
    });

    it('should return the adapter view count for the viewCount rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 7,
        isWatched: true,
      });

      const result = await service.get(VIEWCOUNT_PROP_ID, libItem);

      expect(result).toBe(7);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith(
        '12345',
        0,
        libItem.title,
      );
    });

    it('should return the adapter watched state for the isWatched rule', async () => {
      plexAdapter.getWatchState.mockResolvedValue({
        viewCount: 0,
        isWatched: false,
      });

      const result = await service.get(ISWATCHED_PROP_ID, libItem);

      expect(result).toBe(false);
      expect(plexAdapter.getWatchState).toHaveBeenCalledWith(
        '12345',
        0,
        libItem.title,
      );
    });
  });

  describe('exhaustive Plex rule property getters', () => {
    it.each([
      {
        id: 0,
        name: 'addDate',
        expected: new Date(1_700_000_000 * 1000),
      },
      {
        id: 2,
        name: 'releaseDate',
        expected: new Date('2024-02-03'),
      },
      { id: 3, name: 'rating_user', expected: 9.1 },
      {
        id: 4,
        name: 'people',
        expected: ['Director One', 'Actor Two'],
      },
      { id: 8, name: 'fileVideoResolution', expected: '2160' },
      { id: 9, name: 'fileBitrate', expected: 28_000 },
      { id: 10, name: 'fileVideoCodec', expected: 'hevc' },
      { id: 11, name: 'genre', expected: ['Drama', 'Sci-Fi'] },
      { id: 22, name: 'rating_critics', expected: 6.5 },
      { id: 23, name: 'rating_audience', expected: 8.4 },
      { id: 24, name: 'labels', expected: ['Keep', 'Family'] },
    ])('returns metadata-backed value for $name (id $id)', async (rule) => {
      const metadata = makeMetadata({
        originallyAvailableAt: '2024-02-03',
        userRating: 9.1,
        Role: [
          {
            id: 1,
            filter: 'actor=1',
            tag: 'Director One',
            role: 'Director',
            thumb: '/director.jpg',
          },
          {
            id: 2,
            filter: 'actor=2',
            tag: 'Actor Two',
            role: 'Lead',
            thumb: '/actor.jpg',
          },
        ],
        Media: [
          makeMedia({
            bitrate: 28_000,
            videoCodec: 'hevc',
            videoResolution: '2160',
          }),
        ],
        Genre: [
          { id: 1, filter: 'genre=1', tag: 'Drama' },
          { id: 2, filter: 'genre=2', tag: 'Sci-Fi' },
        ],
        rating: 6.5,
        audienceRating: 8.4,
        Label: [{ tag: 'Keep' }, { tag: 'Family' }],
      });
      plexApi.getMetadata.mockResolvedValue(metadata);

      const result = await service.get(
        rule.id,
        createMediaItem({ id: metadata.ratingKey, type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(result).toEqual(rule.expected);
      expect(plexApi.getMetadata).toHaveBeenCalledWith(metadata.ratingKey, {
        includeExternalMedia: true,
      });
    });

    it('returns the newest direct watch-history date for lastViewedAt (id 7)', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
      plexApi.getWatchHistory.mockResolvedValue([
        makeWatchEntry({ viewedAt: 1_700_000_000 }),
        makeWatchEntry({ viewedAt: 1_720_000_000 }),
        makeWatchEntry({ viewedAt: 1_710_000_000 }),
      ]);

      const result = await service.get(
        7,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(result).toEqual(new Date(1_720_000_000 * 1000));
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('12345');
    });

    it('filters collection counts by rule and manual collection names case-insensitively (id 6)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Collection: [
            { tag: ' Keep ' },
            { tag: ' CLEANUP GROUP ' },
            { tag: ' manual shelf ' },
          ],
        }),
      );

      const result = await service.get(
        6,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({
          dataType: 'movie',
          name: ' cleanup group ',
          collection: {
            manualCollectionName: ' Manual Shelf ',
          } as ReturnType<typeof createRulesDto>['collection'],
        }),
      );

      expect(result).toBe(1);
    });

    it('trims collection names without deduping duplicate values (id 19)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Collection: [
            { tag: ' Space Saga ' },
            { tag: 'space saga' },
            { tag: ' Space Saga ' },
          ],
        }),
      );

      const result = await service.get(
        19,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(result).toEqual(['Space Saga', 'space saga', 'Space Saga']);
    });

    it('uses show metadata for episode genre and labels through parent-backed rules (ids 11 and 24)', async () => {
      const episode = makeMetadata({
        ratingKey: 'episode-1',
        type: 'episode',
        grandparentRatingKey: 'show-1',
      });
      const show = makeMetadata({
        ratingKey: 'show-1',
        type: 'show',
        Genre: [{ id: 1, filter: 'genre=1', tag: 'Mystery' }],
        Label: [{ tag: 'Shared Show Label' }],
      });
      plexApi.getMetadata.mockImplementation(async (ratingKey) =>
        ratingKey === 'show-1' ? show : episode,
      );

      const libItem = createMediaItem({ id: 'episode-1', type: 'episode' });

      await expect(
        service.get(
          11,
          libItem,
          'episode',
          createRulesDto({ dataType: 'show' }),
        ),
      ).resolves.toEqual(['Mystery']);
      await expect(
        service.get(
          24,
          libItem,
          'episode',
          createRulesDto({ dataType: 'show' }),
        ),
      ).resolves.toEqual(['Shared Show Label']);
    });

    it('returns all Plex users that watched every episode in corrected user order (id 12)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ ratingKey: 'season-1', type: 'season' }),
      );
      plexApi.getCorrectedUsers.mockResolvedValue([
        makePlexUser({ plexId: 2, username: 'bob' }),
        makePlexUser({ plexId: 1, username: 'alice' }),
        makePlexUser({ plexId: 3, username: 'charlie' }),
      ]);
      plexApi.getChildrenMetadata.mockResolvedValue([
        makeMetadata({ ratingKey: 'episode-1', type: 'episode' }),
        makeMetadata({ ratingKey: 'episode-2', type: 'episode' }),
      ]);
      plexApi.getWatchHistory.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'episode-1') {
          return [
            makeWatchEntry({ accountID: 1 }),
            makeWatchEntry({ accountID: 2 }),
            makeWatchEntry({ accountID: 999 }),
          ];
        }

        return [
          makeWatchEntry({ accountID: 2 }),
          makeWatchEntry({ accountID: 1 }),
        ];
      });

      const result = await service.get(
        12,
        createMediaItem({ type: 'season' }),
        'season',
        createRulesDto({ dataType: 'show' }),
      );

      expect(result).toEqual(['bob', 'alice']);
    });

    it('returns newest show watch date according to the latest season and episode indexes (id 13)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ ratingKey: 'show-1', type: 'show' }),
      );
      plexApi.getWatchHistory.mockResolvedValue([
        makeWatchEntry({
          parentIndex: 1,
          index: 10,
          viewedAt: 1_730_000_000,
        }),
        makeWatchEntry({
          parentIndex: 2,
          index: 1,
          viewedAt: 1_720_000_000,
        }),
        makeWatchEntry({
          parentIndex: 2,
          index: 2,
          viewedAt: 1_710_000_000,
        }),
      ]);

      const result = await service.get(
        13,
        createMediaItem({ type: 'show' }),
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(result).toEqual(new Date(1_710_000_000 * 1000));
    });

    it('returns season episode counts, watched episode counts, and total views from child metadata and history (ids 14, 15, 17)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ ratingKey: 'season-1', type: 'season' }),
      );
      plexApi.getChildrenMetadata.mockResolvedValue([
        makeMetadata({ ratingKey: 'episode-1', type: 'episode' }),
        makeMetadata({ ratingKey: 'episode-2', type: 'episode' }),
      ]);
      plexApi.getWatchHistory.mockImplementation(async (ratingKey) =>
        ratingKey === 'episode-1'
          ? [makeWatchEntry({ accountID: 1 }), makeWatchEntry({ accountID: 2 })]
          : [makeWatchEntry({ accountID: 1 })],
      );

      const libItem = createMediaItem({ type: 'season' });
      const ruleGroup = createRulesDto({ dataType: 'show' });

      await expect(service.get(14, libItem, 'season', ruleGroup)).resolves.toBe(
        2,
      );
      await expect(service.get(15, libItem, 'season', ruleGroup)).resolves.toBe(
        2,
      );
      await expect(service.get(17, libItem, 'season', ruleGroup)).resolves.toBe(
        3,
      );
    });

    it('returns last added and aired episode dates for show and season-scoped rules (ids 16, 27, 29)', async () => {
      const show = makeMetadata({ ratingKey: 'show-1', type: 'show' });
      const seasonOne = makeMetadata({
        ratingKey: 'season-1',
        type: 'season',
        index: 1,
      });
      const seasonTwo = makeMetadata({
        ratingKey: 'season-2',
        type: 'season',
        index: 2,
      });
      const episode = makeMetadata({
        ratingKey: 'episode-1',
        type: 'episode',
        parentRatingKey: 'season-2',
      });
      const finalEpisodes = [
        makeMetadata({
          ratingKey: 'episode-2-1',
          type: 'episode',
          index: 1,
          addedAt: 1_710_000_000,
          originallyAvailableAt: '2024-04-10',
        }),
        makeMetadata({
          ratingKey: 'episode-2-2',
          type: 'episode',
          index: 2,
          addedAt: 1_720_000_000,
          originallyAvailableAt: '2024-04-17',
        }),
      ];
      plexApi.getMetadata.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'episode-1') return episode;
        if (ratingKey === 'season-2') return seasonTwo;
        return show;
      });
      plexApi.getChildrenMetadata.mockImplementation(async (ratingKey) =>
        ratingKey === 'show-1' ? [seasonOne, seasonTwo] : finalEpisodes,
      );

      await expect(
        service.get(
          16,
          createMediaItem({ id: 'show-1', type: 'show' }),
          'show',
          createRulesDto({ dataType: 'show' }),
        ),
      ).resolves.toEqual(new Date(1_720_000_000 * 1000));
      await expect(
        service.get(
          27,
          createMediaItem({ id: 'show-1', type: 'show' }),
          'show',
          createRulesDto({ dataType: 'show' }),
        ),
      ).resolves.toEqual(new Date('2024-04-17'));
      await expect(
        service.get(
          29,
          createMediaItem({ id: 'episode-1', type: 'episode' }),
          'episode',
          createRulesDto({ dataType: 'show' }),
        ),
      ).resolves.toEqual(new Date('2024-04-17'));
    });

    it('returns known show watchers in corrected user order while ignoring unknown accounts (id 18)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ ratingKey: 'show-1', type: 'show' }),
      );
      plexApi.getCorrectedUsers.mockResolvedValue([
        makePlexUser({ plexId: 2, username: 'bob' }),
        makePlexUser({ plexId: 1, username: 'alice' }),
        makePlexUser({ plexId: 3, username: 'charlie' }),
      ]);
      plexApi.getWatchHistory.mockResolvedValue([
        makeWatchEntry({ accountID: 1 }),
        makeWatchEntry({ accountID: 999 }),
        makeWatchEntry({ accountID: 2 }),
        makeWatchEntry({ accountID: 1 }),
      ]);

      const result = await service.get(
        18,
        createMediaItem({ type: 'show' }),
        'show',
        createRulesDto({ dataType: 'show' }),
      );

      expect(result).toEqual(['bob', 'alice']);
    });

    it('dedupes playlists by ratingKey for show-level count and names, then trims names (ids 20 and 21)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ ratingKey: 'show-1', type: 'show' }),
      );
      plexApi.getChildrenMetadata.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'show-1') {
          return [
            makeMetadata({ ratingKey: 'season-1', type: 'season', index: 1 }),
          ];
        }

        return [
          makeMetadata({ ratingKey: 'episode-1', type: 'episode', index: 1 }),
          makeMetadata({ ratingKey: 'episode-2', type: 'episode', index: 2 }),
        ];
      });
      plexApi.getPlaylists.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'episode-1') {
          return [
            makePlaylist({ ratingKey: 'playlist-a', title: ' Road Trip ' }),
            makePlaylist({ ratingKey: 'playlist-b', title: 'Evening' }),
          ];
        }

        return [
          makePlaylist({ ratingKey: 'playlist-a', title: ' Duplicate Name ' }),
          makePlaylist({ ratingKey: 'playlist-c', title: ' Finale ' }),
        ];
      });

      const libItem = createMediaItem({ type: 'show' });
      const ruleGroup = createRulesDto({ dataType: 'show' });

      await expect(service.get(20, libItem, 'show', ruleGroup)).resolves.toBe(
        3,
      );
      await expect(
        service.get(21, libItem, 'show', ruleGroup),
      ).resolves.toEqual(['Road Trip', 'Evening', 'Finale']);
    });

    it('trims direct movie playlist names without deduping duplicate values (id 21)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ ratingKey: 'movie-1', type: 'movie' }),
      );
      plexApi.getPlaylists.mockResolvedValue([
        makePlaylist({ ratingKey: 'playlist-a', title: ' Road Trip ' }),
        makePlaylist({ ratingKey: 'playlist-b', title: 'Road Trip' }),
        makePlaylist({ ratingKey: 'playlist-c', title: ' Finale ' }),
      ]);

      const result = await service.get(
        21,
        createMediaItem({ id: 'movie-1', type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(result).toEqual(['Road Trip', 'Road Trip', 'Finale']);
    });

    it('returns watchlisted users and boolean watchlisted state using grandparent Plex GUIDs (ids 28 and 30)', async () => {
      const episode = makeMetadata({
        ratingKey: 'episode-1',
        type: 'episode',
        parentRatingKey: 'season-1',
        grandparentRatingKey: 'show-1',
        guid: 'plex://episode/episodeuuid',
      });
      const season = makeMetadata({
        ratingKey: 'season-1',
        type: 'season',
        guid: 'plex://season/seasonuuid',
      });
      const show = makeMetadata({
        ratingKey: 'show-1',
        type: 'show',
        guid: 'plex://show/showuuid',
      });
      plexApi.getMetadata.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'season-1') return season;
        if (ratingKey === 'show-1') return show;
        return episode;
      });
      plexApi.getCorrectedUsers.mockResolvedValue([
        makePlexUser({ plexId: 1, username: 'alice', uuid: 'uuid-a' }),
        makePlexUser({ plexId: 2, username: 'bob', uuid: 'uuid-b' }),
        makePlexUser({ plexId: 3, username: 'charlie' }),
      ]);
      plexApi.getWatchlistIdsForUser.mockImplementation(async (uuid) =>
        uuid === 'uuid-a'
          ? [{ id: 'showuuid', key: '/showuuid', title: 'Show', type: 'show' }]
          : [],
      );

      const libItem = createMediaItem({ id: 'episode-1', type: 'episode' });
      const ruleGroup = createRulesDto({ dataType: 'show' });

      await expect(
        service.get(28, libItem, 'episode', ruleGroup),
      ).resolves.toEqual(['alice']);
      await expect(
        service.get(30, libItem, 'episode', ruleGroup),
      ).resolves.toBe(true);
      expect(plexApi.getWatchlistIdsForUser).toHaveBeenCalledWith(
        'uuid-a',
        'alice',
      );
    });

    it.each([
      { id: 31, name: 'rating_imdb', expected: 7.8 },
      { id: 32, name: 'rating_rottenTomatoesCritic', expected: 6.6 },
      { id: 33, name: 'rating_rottenTomatoesAudience', expected: 8.1 },
      { id: 34, name: 'rating_tmdb', expected: 7.4 },
    ])('returns external media rating for $name (id $id)', async (rule) => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Rating: [
            { image: 'imdb://image.rating', type: 'audience', value: 7.8 },
            {
              image: 'rottentomatoes://critic.rating',
              type: 'critic',
              value: 6.6,
            },
            {
              image: 'rottentomatoes://audience.rating',
              type: 'audience',
              value: 8.1,
            },
            {
              image: 'themoviedb://audience.rating',
              type: 'audience',
              value: 7.4,
            },
          ],
        }),
      );

      const result = await service.get(
        rule.id,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie' }),
      );

      expect(result).toBe(rule.expected);
    });

    it.each([
      { id: 35, name: 'rating_imdbShow', expected: 8.8 },
      { id: 36, name: 'rating_rottenTomatoesCriticShow', expected: 7.2 },
      { id: 37, name: 'rating_rottenTomatoesAudienceShow', expected: 8.5 },
      { id: 38, name: 'rating_tmdbShow', expected: 8.3 },
    ])('returns grandparent show rating for $name (id $id)', async (rule) => {
      const episode = makeMetadata({
        ratingKey: 'episode-1',
        type: 'episode',
        grandparentRatingKey: 'show-1',
      });
      const show = makeMetadata({
        ratingKey: 'show-1',
        type: 'show',
        Rating: [
          { image: 'imdb://image.rating', type: 'audience', value: 8.8 },
          {
            image: 'rottentomatoes://critic.rating',
            type: 'critic',
            value: 7.2,
          },
          {
            image: 'rottentomatoes://audience.rating',
            type: 'audience',
            value: 8.5,
          },
          {
            image: 'themoviedb://audience.rating',
            type: 'audience',
            value: 8.3,
          },
        ],
      });
      plexApi.getMetadata.mockImplementation(async (ratingKey) =>
        ratingKey === 'show-1' ? show : episode,
      );

      const result = await service.get(
        rule.id,
        createMediaItem({ id: 'episode-1', type: 'episode' }),
        'episode',
        createRulesDto({ dataType: 'show' }),
      );

      expect(result).toBe(rule.expected);
    });

    it('counts regular and smart collections while excluding rule-managed regular collections (id 39)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          Collection: [
            { tag: ' Keepers ' },
            { tag: ' cleanup group ' },
            { tag: ' Manual Shelf ' },
          ],
        }),
      );
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'smart-1',
          title: 'Smart Keepers',
          smart: true,
        }),
        makeCollection({ ratingKey: 'normal-1', title: 'Normal Keepers' }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: 'movie-1' }),
      ]);

      const result = await service.get(
        39,
        createMediaItem({ id: 'movie-1', type: 'movie' }),
        'movie',
        createRulesDto({
          dataType: 'movie',
          libraryId: 'lib-1',
          name: 'Cleanup Group',
          collection: {
            manualCollectionName: 'manual shelf',
          } as ReturnType<typeof createRulesDto>['collection'],
        }),
      );

      expect(result).toBe(2);
      expect(plexApi.getCollections).toHaveBeenCalledWith('lib-1', 'movie');
    });

    it('counts parent, grandparent, and smart collection memberships for episode rules (id 40)', async () => {
      const episode = makeMetadata({
        ratingKey: 'episode-1',
        type: 'episode',
        parentRatingKey: 'season-1',
        grandparentRatingKey: 'show-1',
        Collection: [{ tag: ' Episode Set ' }],
      });
      const season = makeMetadata({
        ratingKey: 'season-1',
        type: 'season',
        Collection: [{ tag: ' Season Set ' }],
      });
      const show = makeMetadata({
        ratingKey: 'show-1',
        type: 'show',
        Collection: [{ tag: ' Cleanup Group ' }],
      });
      plexApi.getMetadata.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'season-1') return season;
        if (ratingKey === 'show-1') return show;
        return episode;
      });
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'smart-1',
          title: 'Smart Show',
          smart: true,
        }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: 'episode-1' }),
        makeLibraryItem({ ratingKey: 'season-1' }),
        makeLibraryItem({ ratingKey: 'show-1' }),
      ]);

      const result = await service.get(
        40,
        createMediaItem({ id: 'episode-1', type: 'episode' }),
        'episode',
        createRulesDto({
          dataType: 'show',
          libraryId: 'lib-1',
          name: ' cleanup group ',
        }),
      );

      expect(result).toBe(5);
      expect(plexApi.getCollections).toHaveBeenCalledWith('lib-1');
    });

    it('de-duplicates on raw value then trims when aggregating parent and smart collections (id 41)', async () => {
      const episode = makeMetadata({
        ratingKey: 'episode-1',
        type: 'episode',
        parentRatingKey: 'season-1',
        grandparentRatingKey: 'show-1',
        Collection: [{ tag: ' Space Saga ' }],
      });
      const season = makeMetadata({
        ratingKey: 'season-1',
        type: 'season',
        Collection: [{ tag: 'Space Saga' }, { tag: ' Season Set ' }],
      });
      const show = makeMetadata({
        ratingKey: 'show-1',
        type: 'show',
        Collection: [{ tag: 'Space Saga' }],
      });
      plexApi.getMetadata.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'season-1') return season;
        if (ratingKey === 'show-1') return show;
        return episode;
      });
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'smart-1',
          title: 'Space Saga',
          smart: true,
        }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: 'episode-1' }),
      ]);

      const result = await service.get(
        41,
        createMediaItem({ id: 'episode-1', type: 'episode' }),
        'episode',
        createRulesDto({ dataType: 'show', libraryId: 'lib-1' }),
      );

      // Pre-refactor behaviour (#1630): dedupe runs on the RAW tag, so the
      // exact-equal 'Space Saga' from season, show and the smart collection
      // collapse to one — but the episode's ' Space Saga ' (whitespace variant)
      // survives the raw dedupe and only trims afterwards, leaving two entries.
      expect(result).toEqual(['Space Saga', 'Space Saga', 'Season Set']);
    });

    it('de-duplicates on raw value then trims when including smart collections (id 42)', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          ratingKey: 'movie-1',
          type: 'movie',
          Collection: [
            { tag: 'Space Saga' },
            { tag: ' Space Saga ' },
            { tag: 'Movies' },
          ],
        }),
      );
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'smart-1',
          title: 'Space Saga',
          smart: true,
        }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: 'movie-1' }),
      ]);

      const result = await service.get(
        42,
        createMediaItem({ id: 'movie-1', type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie', libraryId: 'lib-1' }),
      );

      // The exact-equal 'Space Saga' (metadata + smart) collapse; the whitespace
      // variant ' Space Saga ' survives the raw dedupe -> a post-trim duplicate.
      expect(result).toEqual(['Space Saga', 'Space Saga', 'Movies']);
      expect(plexApi.getCollections).toHaveBeenCalledWith('lib-1', 'movie');
    });

    it('trims parent collection names without deduping when smart collections are not included (ids 25 and 26)', async () => {
      const episode = makeMetadata({
        ratingKey: 'episode-1',
        type: 'episode',
        parentRatingKey: 'season-1',
        grandparentRatingKey: 'show-1',
        Collection: [{ tag: ' Episode Set ' }],
      });
      const season = makeMetadata({
        ratingKey: 'season-1',
        type: 'season',
        Collection: [{ tag: 'Episode Set' }, { tag: ' Season Set ' }],
      });
      const show = makeMetadata({
        ratingKey: 'show-1',
        type: 'show',
        Collection: [{ tag: ' Cleanup Group ' }],
      });
      plexApi.getMetadata.mockImplementation(async (ratingKey) => {
        if (ratingKey === 'season-1') return season;
        if (ratingKey === 'show-1') return show;
        return episode;
      });

      const libItem = createMediaItem({ id: 'episode-1', type: 'episode' });
      const ruleGroup = createRulesDto({
        dataType: 'show',
        name: 'cleanup group',
      });

      await expect(
        service.get(25, libItem, 'episode', ruleGroup),
      ).resolves.toBe(3);
      await expect(
        service.get(26, libItem, 'episode', ruleGroup),
      ).resolves.toEqual([
        'Episode Set',
        'Episode Set',
        'Season Set',
        'Cleanup Group',
      ]);
    });
  });

  describe('sw_markedWatchedEpisodes (id 45)', () => {
    const MARKED_WATCHED_PROP_ID = 45;

    it('returns Plex viewedLeafCount (watched state, including manual marks)', async () => {
      const libItem = createMediaItem({ id: PLEX_ITEM_ID, type: 'show' });
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ type: 'show', leafCount: 22, viewedLeafCount: 22 }),
      );

      const result = await service.get(MARKED_WATCHED_PROP_ID, libItem);

      expect(result).toBe(22);
    });

    it('returns 0 when no episodes are marked as watched', async () => {
      const libItem = createMediaItem({ id: PLEX_ITEM_ID, type: 'show' });
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ type: 'show', leafCount: 10, viewedLeafCount: 0 }),
      );

      const result = await service.get(MARKED_WATCHED_PROP_ID, libItem);

      expect(result).toBe(0);
    });
  });

  it('requests external media metadata for IMDb ratings', async () => {
    const mediaItem = createMediaItem({ id: PLEX_ITEM_ID });

    plexApi.getMetadata.mockResolvedValue(
      makeMetadata({
        ratingKey: PLEX_ITEM_ID,
        title: 'Test Movie',
        Rating: [
          { image: 'imdb://image.rating', type: 'audience', value: 7.8 },
        ],
      }),
    );

    const result = await service.get(
      31,
      mediaItem,
      'movie',
      createRulesDto({ dataType: 'movie' }),
    );

    expect(result).toBe(7.8);
    expect(plexApi.getMetadata).toHaveBeenCalledWith(PLEX_ITEM_ID, {
      includeExternalMedia: true,
    });
  });

  it('requests external media metadata for show IMDb ratings', async () => {
    const mediaItem = createMediaItem({ id: PLEX_ITEM_ID, type: 'episode' });

    plexApi.getMetadata
      .mockResolvedValueOnce(
        makeMetadata({
          ratingKey: PLEX_ITEM_ID,
          type: 'episode',
          title: 'Episode 1',
          grandparentRatingKey: 'show-1',
        }),
      )
      .mockResolvedValueOnce(
        makeMetadata({
          ratingKey: 'show-1',
          type: 'show',
          title: 'Test Show',
          guid: 'guid-show',
          Rating: [
            { image: 'imdb://image.rating', type: 'audience', value: 8.2 },
          ],
        }),
      );

    const result = await service.get(
      35,
      mediaItem,
      'episode',
      createRulesDto({ dataType: 'show' }),
    );

    expect(result).toBe(8.2);
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(1, PLEX_ITEM_ID, {
      includeExternalMedia: true,
    });
    expect(plexApi.getMetadata).toHaveBeenNthCalledWith(2, 'show-1', {
      includeExternalMedia: true,
    });
  });

  describe('collection_siblings_lastViewedAt (id 44)', () => {
    const COLLECTION_SIBLINGS_PROP_ID = 44;

    it('returns the newest viewedAt across siblings, aggregating per-user history', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Collection: [{ tag: 'Franchise A Collection' }],
        }),
      );
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'coll-1',
          title: 'Franchise A Collection',
        }),
        makeCollection({ ratingKey: 'coll-2', title: 'Unrelated Collection' }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: '12345' }),
        makeLibraryItem({ ratingKey: 'sibling-a' }),
        makeLibraryItem({ ratingKey: 'sibling-b' }),
      ]);
      plexApi.getWatchHistory.mockImplementation(async (rk) => {
        if (rk === '12345') {
          return [makeWatchEntry({ viewedAt: 1_700_000_000, accountID: 1 })];
        }
        if (rk === 'sibling-a') {
          // A non-admin user watched this sibling — only visible via history.
          return [makeWatchEntry({ viewedAt: 1_710_000_000, accountID: 2 })];
        }
        return [];
      });

      const libItem = createMediaItem({ type: 'movie' });
      const ruleGroup = createRulesDto({
        dataType: 'movie',
        libraryId: 'lib-1',
        name: 'My cleanup group',
      });

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        libItem,
        'movie',
        ruleGroup,
      );

      expect(result).toEqual(new Date(1_710_000_000 * 1000));
      expect(plexApi.getCollections).toHaveBeenCalledWith('lib-1', 'movie');
      expect(plexApi.getCollectionChildren).toHaveBeenCalledTimes(1);
      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith('coll-1');
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('12345');
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('sibling-a');
      expect(plexApi.getWatchHistory).toHaveBeenCalledWith('sibling-b');
    });

    it('returns null when the movie is in no collections', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata({ Collection: [] }));

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie', libraryId: 'lib-1' }),
      );

      expect(result).toBeNull();
      expect(plexApi.getCollections).not.toHaveBeenCalled();
      expect(plexApi.getWatchHistory).not.toHaveBeenCalled();
    });

    it('returns null when no sibling has any watch history', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({ Collection: [{ tag: 'Franchise B Collection' }] }),
      );
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'coll-fb',
          title: 'Franchise B Collection',
        }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: '12345' }),
        makeLibraryItem({ ratingKey: 'sibling-a' }),
      ]);
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({ dataType: 'movie', libraryId: 'lib-1' }),
      );

      expect(result).toBeNull();
    });

    it("ignores the rule group's own managed collection", async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Collection: [
            { tag: 'Franchise A Collection' },
            { tag: 'My cleanup group' },
          ],
        }),
      );
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'coll-1',
          title: 'Franchise A Collection',
        }),
        makeCollection({ ratingKey: 'coll-own', title: 'My cleanup group' }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: '12345' }),
      ]);
      plexApi.getWatchHistory.mockResolvedValue([
        makeWatchEntry({ viewedAt: 1_690_000_000, accountID: 1 }),
      ]);

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({
          dataType: 'movie',
          libraryId: 'lib-1',
          name: 'My cleanup group',
        }),
      );

      expect(result).toEqual(new Date(1_690_000_000 * 1000));
      expect(plexApi.getCollectionChildren).toHaveBeenCalledTimes(1);
      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith('coll-1');
    });

    it('excludes rule and manual collection names with whitespace-safe case-insensitive matching', async () => {
      plexApi.getMetadata.mockResolvedValue(
        makeMetadata({
          Collection: [
            { tag: ' Franchise C Collection ' },
            { tag: ' CLEANUP GROUP ' },
            { tag: ' Manual Shelf ' },
          ],
        }),
      );
      plexApi.getCollections.mockResolvedValue([
        makeCollection({
          ratingKey: 'coll-franchise',
          title: 'Franchise C Collection',
        }),
        makeCollection({ ratingKey: 'coll-rule', title: 'Cleanup Group' }),
        makeCollection({ ratingKey: 'coll-manual', title: 'Manual Shelf' }),
      ]);
      plexApi.getCollectionChildren.mockResolvedValue([
        makeLibraryItem({ ratingKey: 'sibling-c' }),
      ]);
      plexApi.getWatchHistory.mockResolvedValue([
        makeWatchEntry({ viewedAt: 1_680_000_000 }),
      ]);

      const result = await service.get(
        COLLECTION_SIBLINGS_PROP_ID,
        createMediaItem({ type: 'movie' }),
        'movie',
        createRulesDto({
          dataType: 'movie',
          libraryId: 'lib-1',
          name: ' cleanup group ',
          collection: {
            manualCollectionName: ' manual shelf ',
          } as ReturnType<typeof createRulesDto>['collection'],
        }),
      );

      expect(result).toEqual(new Date(1_680_000_000 * 1000));
      expect(plexApi.getCollectionChildren).toHaveBeenCalledTimes(1);
      expect(plexApi.getCollectionChildren).toHaveBeenCalledWith(
        'coll-franchise',
      );
    });
  });

  describe('seenBy (id 1)', () => {
    it('maps watch-history account ids to known Plex usernames', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
      plexApi.getCorrectedUsers.mockResolvedValue([
        makePlexUser({ plexId: 2, username: 'bob' }),
        makePlexUser({ plexId: 1, username: 'alice' }),
        makePlexUser({ plexId: 3, username: 'charlie' }),
      ]);
      plexApi.getWatchHistory.mockResolvedValue([
        makeWatchEntry({ accountID: 1 }),
        makeWatchEntry({ accountID: 999 }),
        makeWatchEntry({ accountID: 2 }),
      ]);

      const result = await service.get(
        SEEN_BY_PROP_ID,
        createMediaItem({ type: 'movie' }),
      );

      expect(result).toEqual(['bob', 'alice']);
    });

    it('returns [] for confirmed-empty history (no one has watched the item)', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
      plexApi.getCorrectedUsers.mockResolvedValue([
        makePlexUser({ plexId: 1, username: 'alice' }),
      ]);
      plexApi.getWatchHistory.mockResolvedValue([]);

      const result = await service.get(
        SEEN_BY_PROP_ID,
        createMediaItem({ type: 'movie' }),
      );

      expect(result).toEqual([]);
    });

    it('returns undefined when watch-history lookup fails so the comparator skips the item rather than misclassifying it as "viewed by no one"', async () => {
      plexApi.getMetadata.mockResolvedValue(makeMetadata());
      plexApi.getCorrectedUsers.mockResolvedValue([
        makePlexUser({ plexId: 1, username: 'alice' }),
      ]);
      plexApi.getWatchHistory.mockRejectedValue(new Error('plex unreachable'));

      const result = await service.get(
        SEEN_BY_PROP_ID,
        createMediaItem({ type: 'movie' }),
      );

      expect(result).toBeUndefined();
    });
  });
});
