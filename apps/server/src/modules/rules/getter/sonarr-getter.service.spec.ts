import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import {
  createArrDiskspaceResource,
  createCollectionMedia,
  createMediaItem,
  createRuleDto,
  createRulesDto,
  createSonarrEpisode,
  createSonarrEpisodeFile,
  createSonarrSeries,
} from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { SonarrApi } from '../../api/servarr-api/helpers/sonarr.helper';
import { SonarrSeries } from '../../api/servarr-api/interfaces/sonarr.interface';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MetadataService } from '../../metadata/metadata.service';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { SonarrGetterService } from './sonarr-getter.service';

// Let the memo's eviction callback (chained on the resolved promise) run.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('SonarrGetterService', () => {
  let sonarrGetterService: SonarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mockMediaServer: {
    getMetadata: jest.Mock<Promise<MediaItem>, [string]>;
  };
  let metadataService: Mocked<MetadataService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SonarrGetterService).compile();

    sonarrGetterService = unit;

    servarrService = unitRef.get(ServarrService);
    mediaServerFactory = unitRef.get(MediaServerFactory);
    metadataService = unitRef.get(MetadataService);
    logger = unitRef.get(MaintainerrLogger);

    metadataService.resolveLookupCandidatesFromMediaItemForService.mockResolvedValue(
      [{ providerKey: 'tvdb', id: 1 }] as any,
    );

    // Create mock media server
    mockMediaServer = {
      getMetadata: jest.fn(),
    };
    mediaServerFactory.getService.mockResolvedValue(
      mockMediaServer as unknown as IMediaServerService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('part_of_latest_season', () => {
    it.each([
      { type: 'season', title: 'SEASONS' },
      {
        type: 'episode',
        title: 'EPISODES',
      },
    ])(
      'should return true when next season has not started airing yet for $title',
      async ({ type }: { type: string }) => {
        jest.useFakeTimers().setSystemTime(new Date('2025-01-01'));

        const collectionMedia = createCollectionMedia(type as MediaItemType);
        collectionMedia.collection.sonarrSettingsId = 1;

        mockMediaServer.getMetadata.mockResolvedValue(
          createMediaItem({
            type: 'show',
          }),
        );
        const series = createSonarrSeries({
          seasons: [
            {
              seasonNumber: 0,
              monitored: false,
            },
            {
              seasonNumber: 1,
              monitored: true,
            },
            {
              seasonNumber: 2,
              monitored: true,
            },
          ],
        });

        const mockedSonarrApi = mockSonarrApi(series);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodes')
          .mockImplementation((seriesId, seasonNumber) => {
            if (seasonNumber === 0) {
              return Promise.resolve([
                createSonarrEpisode({
                  seriesId,
                  seasonNumber,
                  episodeNumber: 1,
                  airDateUtc: '2024-06-26T00:00:00Z',
                }),
              ]);
            } else if (seasonNumber === 1) {
              return Promise.resolve([
                createSonarrEpisode({
                  seriesId,
                  seasonNumber,
                  episodeNumber: 1,
                  airDateUtc: '2024-06-25T00:00:00Z',
                }),
              ]);
            } else if (seasonNumber === 2) {
              return Promise.resolve([
                createSonarrEpisode({
                  seriesId,
                  seasonNumber,
                  episodeNumber: 1,
                  airDateUtc: '2025-04-01T00:00:00Z',
                }),
              ]);
            }

            return Promise.resolve([]);
          });

        const mediaItem = createMediaItem({
          type: type == 'episode' ? 'episode' : 'season',
          index: 1,
          parentIndex: type == 'episode' ? 1 : undefined, // For episode, target parent (season)
        });

        const response = await sonarrGetterService.get(
          13,
          mediaItem,
          type as MediaItemType,
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: type as MediaItemType,
          }),
        );

        expect(response).toBe(true);
      },
    );

    describe('part_of_latest_season', () => {
      it.each([
        { type: 'season', title: 'SEASONS' },
        {
          type: 'episode',
          title: 'EPISODES',
        },
      ])(
        'should return false when a later season has aired for $title',
        async ({ type }: { type: string }) => {
          jest.useFakeTimers().setSystemTime(new Date('2025-06-01'));

          const collectionMedia = createCollectionMedia(type as MediaItemType);
          collectionMedia.collection.sonarrSettingsId = 1;

          mockMediaServer.getMetadata.mockResolvedValue(
            createMediaItem({
              type: 'show',
            }),
          );
          const series = createSonarrSeries({
            seasons: [
              {
                seasonNumber: 0,
                monitored: false,
              },
              {
                seasonNumber: 1,
                monitored: true,
              },
              {
                seasonNumber: 2,
                monitored: true,
              },
            ],
          });

          const mockedSonarrApi = mockSonarrApi(series);
          jest
            .spyOn(mockedSonarrApi, 'getEpisodes')
            .mockImplementation((seriesId, seasonNumber) => {
              if (seasonNumber === 0) {
                return Promise.resolve([
                  createSonarrEpisode({
                    seriesId,
                    seasonNumber,
                    episodeNumber: 1,
                    airDateUtc: '2024-06-26T00:00:00Z',
                  }),
                ]);
              } else if (seasonNumber === 1) {
                return Promise.resolve([
                  createSonarrEpisode({
                    seriesId,
                    seasonNumber,
                    episodeNumber: 1,
                    airDateUtc: '2024-06-25T00:00:00Z',
                  }),
                ]);
              } else if (seasonNumber === 2) {
                return Promise.resolve([
                  createSonarrEpisode({
                    seriesId,
                    seasonNumber,
                    episodeNumber: 1,
                    airDateUtc: '2025-04-01T00:00:00Z',
                  }),
                ]);
              }

              return Promise.resolve([]);
            });

          const mediaItem = createMediaItem({
            type: type == 'episode' ? 'episode' : 'season',
            index: 1,
            parentIndex: type == 'episode' ? 1 : undefined, // For episode, target parent (season)
          });

          const response = await sonarrGetterService.get(
            13,
            mediaItem,
            type as MediaItemType,
            createRulesDto({
              collection: collectionMedia.collection,
              dataType: type as MediaItemType,
            }),
          );

          expect(response).toBe(false);
        },
      );
    });

    // #3153: in a full run the comparator resolves several of a show's seasons
    // concurrently, all sharing ONE memoized `showResponse.seasons` array via the
    // run-scoped ArrLookupCache. The latest-aired-season scan must not mutate that
    // shared array, or evaluating one season corrupts the answer for the others.
    // (Test Media passes no cache, so it never hit this - hence the run/test split.)
    describe('shared ArrLookupCache across show seasons (#3153)', () => {
      it.each([
        { type: 'season', title: 'SEASONS' },
        { type: 'episode', title: 'EPISODES' },
      ])(
        'evaluating an earlier season first does not flip the latest aired season for $title',
        async ({ type }: { type: string }) => {
          jest.useFakeTimers().setSystemTime(new Date('2025-06-01'));

          const collectionMedia = createCollectionMedia(type as MediaItemType);
          collectionMedia.collection.sonarrSettingsId = 1;

          mockMediaServer.getMetadata.mockResolvedValue(
            createMediaItem({ type: 'show' }),
          );

          // S0/S1/S2 episode 1 already aired; S3 episode 1 is in the future, so
          // the latest *aired* season is S2.
          const series = createSonarrSeries({
            seasons: [
              { seasonNumber: 0, monitored: false },
              { seasonNumber: 1, monitored: true },
              { seasonNumber: 2, monitored: true },
              { seasonNumber: 3, monitored: true },
            ],
          });

          const airDateUtcBySeason: Record<number, string> = {
            0: '2024-01-01T00:00:00Z',
            1: '2024-06-25T00:00:00Z',
            2: '2025-04-01T00:00:00Z',
            3: '2025-12-01T00:00:00Z',
          };

          const mockedSonarrApi = mockSonarrApi(series);
          jest
            .spyOn(mockedSonarrApi, 'getEpisodes')
            .mockImplementation((seriesId, seasonNumber) =>
              Promise.resolve([
                createSonarrEpisode({
                  seriesId,
                  seasonNumber,
                  episodeNumber: 1,
                  airDateUtc: airDateUtcBySeason[seasonNumber as number],
                }),
              ]),
            );

          const evaluate = (seasonNumber: number, cache: ArrLookupCache) =>
            sonarrGetterService.get(
              13,
              createMediaItem({
                type: type === 'episode' ? 'episode' : 'season',
                index: seasonNumber,
                parentIndex: type === 'episode' ? seasonNumber : undefined,
              }),
              type as MediaItemType,
              createRulesDto({
                collection: collectionMedia.collection,
                dataType: type as MediaItemType,
              }),
              undefined,
              cache,
            );

          // One run-shared cache, exactly as the comparator wires it. Evaluating
          // the older S1 first must not corrupt the shared season array and flip
          // S2 (the real latest aired season) to false.
          const cache = new ArrLookupCache();
          const s1 = await evaluate(1, cache);
          const s2 = await evaluate(2, cache);

          expect(s1).toBe(false);
          expect(s2).toBe(true);
        },
      );
    });

    // Candidate resolution preceding the series lookup ran once per rule
    // condition; the run-scoped ArrLookupCache now memoizes it so it runs once
    // per show (#3285). Mirrors the arr identity lookup's run-scoped dedup (#2897).
    describe('candidate resolution memoization (#3285)', () => {
      let collectionMedia: CollectionMedia;
      let showItem: MediaItem;

      beforeEach(() => {
        collectionMedia = createCollectionMedia('show');
        collectionMedia.collection.sonarrSettingsId = 1;
        showItem = createMediaItem({ type: 'show' });
        mockSonarrApi(createSonarrSeries());
      });

      // id 0 = addDate - a plain show lookup that goes through candidate resolution.
      const call = (arrLookupCache?: ArrLookupCache) =>
        sonarrGetterService.get(
          0,
          showItem,
          'show',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'show',
          }),
          undefined,
          arrLookupCache,
        );

      it('resolves candidates once per show across conditions sharing a run cache', async () => {
        const cache = new ArrLookupCache();

        await call(cache);
        await call(cache); // second condition, same show + same run cache

        expect(
          metadataService.resolveLookupCandidatesFromMediaItemForService,
        ).toHaveBeenCalledTimes(1);
      });

      it('re-resolves per call when no run cache is provided (unchanged behaviour)', async () => {
        await call();
        await call();

        expect(
          metadataService.resolveLookupCandidatesFromMediaItemForService,
        ).toHaveBeenCalledTimes(2);
      });

      it('evicts an empty resolution so a later condition retries (transient safety, #3125)', async () => {
        metadataService.resolveLookupCandidatesFromMediaItemForService
          .mockResolvedValueOnce([]) // transient: nothing resolved
          .mockResolvedValue([{ providerKey: 'tvdb', id: 1 }] as any);
        const cache = new ArrLookupCache();

        await call(cache); // empty -> evicted from the memo
        await flushMicrotasks();
        await call(cache); // retries instead of serving the stale empty result

        expect(
          metadataService.resolveLookupCandidatesFromMediaItemForService,
        ).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('seasons_monitored', () => {
    it('returns monitored episode count for a season even when all episodes have files', async () => {
      const collectionMedia = createCollectionMedia('season');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'show',
        }),
      );

      const series = createSonarrSeries({
        seasons: [
          {
            seasonNumber: 0,
            monitored: false,
          },
          {
            seasonNumber: 6,
            monitored: true,
            statistics: {
              episodeCount: 10,
              episodeFileCount: 10,
              totalEpisodeCount: 10,
              sizeOnDisk: 0,
              percentOfEpisodes: 100,
            },
          },
        ],
      });

      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue(
        Array.from({ length: 10 }, (_, index) =>
          createSonarrEpisode({
            seriesId: series.id,
            seasonNumber: 6,
            episodeNumber: index + 1,
            monitored: false,
            hasFile: true,
          }),
        ),
      );

      const response = await sonarrGetterService.get(
        11,
        createMediaItem({
          type: 'season',
          index: 6,
        }),
        'season',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'season',
        }),
      );

      expect(response).toBe(0);
      expect(mockedSonarrApi.getEpisodes).toHaveBeenCalledWith(series.id, 6);
    });

    it('returns monitored episode count for a season even when only some monitored episodes have files', async () => {
      const collectionMedia = createCollectionMedia('season');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'show',
        }),
      );

      const series = createSonarrSeries({
        seasons: [
          {
            seasonNumber: 0,
            monitored: false,
          },
          {
            seasonNumber: 8,
            monitored: true,
            statistics: {
              episodeCount: 2,
              episodeFileCount: 2,
              totalEpisodeCount: 10,
              sizeOnDisk: 0,
              percentOfEpisodes: 20,
            },
          },
        ],
      });

      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue(
        Array.from({ length: 10 }, (_, index) =>
          createSonarrEpisode({
            seriesId: series.id,
            seasonNumber: 8,
            episodeNumber: index + 1,
            monitored: true,
            hasFile: index < 2,
          }),
        ),
      );

      const response = await sonarrGetterService.get(
        11,
        createMediaItem({
          type: 'season',
          index: 8,
        }),
        'season',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'season',
        }),
      );

      expect(response).toBe(10);
      expect(mockedSonarrApi.getEpisodes).toHaveBeenCalledWith(series.id, 8);
    });

    it('returns the season monitored episode count for episode rules', async () => {
      const collectionMedia = createCollectionMedia('episode');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'show',
        }),
      );

      const series = createSonarrSeries({
        seasons: [
          {
            seasonNumber: 0,
            monitored: false,
          },
          {
            seasonNumber: 4,
            monitored: true,
            statistics: {
              episodeCount: 3,
              episodeFileCount: 1,
              totalEpisodeCount: 10,
              sizeOnDisk: 0,
              percentOfEpisodes: 30,
            },
          },
        ],
      });

      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue(
        Array.from({ length: 10 }, (_, index) =>
          createSonarrEpisode({
            seriesId: series.id,
            seasonNumber: 4,
            episodeNumber: index + 1,
            monitored: index < 3,
            hasFile: index === 0,
          }),
        ),
      );

      const response = await sonarrGetterService.get(
        11,
        createMediaItem({
          type: 'episode',
          index: 1,
          parentIndex: 4,
          parentId: 'season-4',
          grandparentId: 'show-1',
        }),
        'episode',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'episode',
        }),
      );

      expect(response).toBe(3);
      expect(mockedSonarrApi.getEpisodes).toHaveBeenCalledWith(series.id, 4);
    });
  });

  describe('finale properties', () => {
    it('returns season finale state for season rules', async () => {
      const collectionMedia = createCollectionMedia('season');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'show',
        }),
      );

      const series = createSonarrSeries({
        seasons: [
          {
            seasonNumber: 0,
            monitored: false,
          },
          {
            seasonNumber: 5,
            monitored: true,
          },
        ],
      });

      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 5,
          episodeNumber: 10,
          finaleType: 'season',
          hasFile: true,
        }),
      ]);

      const response = await sonarrGetterService.get(
        16,
        createMediaItem({
          type: 'season',
          index: 5,
        }),
        'season',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'season',
        }),
      );

      expect(response).toBe(true);
      expect(mockedSonarrApi.getEpisodes).toHaveBeenCalledWith(series.id, 5);
    });

    it('returns series finale state for show rules', async () => {
      const collectionMedia = createCollectionMedia('show');
      collectionMedia.collection.sonarrSettingsId = 1;

      const series = createSonarrSeries();
      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 5,
          episodeNumber: 10,
          finaleType: 'series',
          hasFile: true,
        }),
      ]);

      const response = await sonarrGetterService.get(
        17,
        createMediaItem({
          type: 'show',
        }),
        'show',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'show',
        }),
      );

      expect(response).toBe(true);
      expect(mockedSonarrApi.getEpisodes).toHaveBeenCalledWith(series.id);
    });
  });

  describe('episode file properties', () => {
    let collectionMedia: CollectionMedia;
    let mockedSonarrApi: SonarrApi;
    let series: SonarrSeries;
    let mediaItem: MediaItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('episode');
      collectionMedia.collection.sonarrSettingsId = 1;
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'show',
        }),
      );
      series = createSonarrSeries();
      mockedSonarrApi = mockSonarrApi(series);
      mediaItem = createMediaItem({ type: 'episode' });
    });

    describe('fileQualityCutoffMet', () => {
      it('should return true when the cut off is met', async () => {
        const episodeFile = createSonarrEpisodeFile({
          qualityCutoffNotMet: false,
        });
        const episode = createSonarrEpisode({
          episodeFileId: episodeFile.id,
        });
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([episode]);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodeFile')
          .mockResolvedValue(episodeFile);

        const response = await sonarrGetterService.get(
          23,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe(true);
      });

      it('should return false when the cut off is not met', async () => {
        const episodeFile = createSonarrEpisodeFile({
          qualityCutoffNotMet: true,
        });
        const episode = createSonarrEpisode({
          episodeFileId: episodeFile.id,
        });
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([episode]);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodeFile')
          .mockResolvedValue(episodeFile);

        const response = await sonarrGetterService.get(
          23,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe(false);
      });

      it('should return false when no episode file exists', async () => {
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([]);

        const response = await sonarrGetterService.get(
          23,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe(false);
      });
    });

    describe('fileQualityName', () => {
      it('should return quality name', async () => {
        const episodeFile = createSonarrEpisodeFile({
          quality: {
            quality: {
              id: 1,
              name: 'WEBDL-1080p',
              source: 'web',
              resolution: 1080,
            },
          },
        });
        const episode = createSonarrEpisode({
          episodeFileId: episodeFile.id,
        });
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([episode]);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodeFile')
          .mockResolvedValue(episodeFile);

        const response = await sonarrGetterService.get(
          24,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe('WEBDL-1080p');
      });

      it('should return null when no episode file exists', async () => {
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([]);

        const response = await sonarrGetterService.get(
          24,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe(null);
      });
    });

    describe('fileAudioLanguages', () => {
      it('should return audio languages', async () => {
        const episodeFile = createSonarrEpisodeFile({
          mediaInfo: { audioLanguages: 'eng' } as any,
        });
        const episode = createSonarrEpisode({
          episodeFileId: episodeFile.id,
        });
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([episode]);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodeFile')
          .mockResolvedValue(episodeFile);

        const response = await sonarrGetterService.get(
          26,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe('eng');
      });

      it('should return null when no episode file exists', async () => {
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([]);

        const response = await sonarrGetterService.get(
          26,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe(null);
      });

      it('should return null when no media info exists', async () => {
        const episodeFile = createSonarrEpisodeFile({
          mediaInfo: undefined,
        });
        const episode = createSonarrEpisode({
          episodeFileId: episodeFile.id,
        });
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([episode]);
        jest
          .spyOn(mockedSonarrApi, 'getEpisodeFile')
          .mockResolvedValue(episodeFile);

        const response = await sonarrGetterService.get(
          26,
          mediaItem,
          'episode',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'episode',
          }),
        );

        expect(response).toBe(null);
      });
    });
  });

  describe('qualityProfileName', () => {
    it.each([
      { type: 'season', title: 'SEASONS' },
      {
        type: 'show',
        title: 'SHOWS',
      },
      {
        type: 'episode',
        title: 'EPISODES',
      },
    ])(
      'should return show quality name for $title',
      async ({ type }: { type: string }) => {
        const collectionMedia = createCollectionMedia('episode');
        collectionMedia.collection.sonarrSettingsId = 1;
        mockMediaServer.getMetadata.mockResolvedValue(
          createMediaItem({
            type: 'show',
          }),
        );
        const mediaItem = createMediaItem({ type: type as MediaItemType });
        const series = createSonarrSeries({
          qualityProfileId: 2,
        });
        const mockedSonarrApi = mockSonarrApi(series);
        jest.spyOn(mockedSonarrApi, 'getProfiles').mockResolvedValue([
          {
            id: 1,
            name: 'WEBDL-1080p',
          },
          {
            id: 2,
            name: 'WEBDL-720p',
          },
        ]);
        const episode = createSonarrEpisode();
        jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([episode]);

        const response = await sonarrGetterService.get(
          25,
          mediaItem,
          type as MediaItemType,
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: type as MediaItemType,
          }),
        );

        expect(response).toBe('WEBDL-720p');
      },
    );
  });

  describe('diskspace properties', () => {
    let collectionMedia: CollectionMedia;
    let mediaItem: MediaItem;
    let mockedSonarrApi: SonarrApi;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('show');
      collectionMedia.collection.sonarrSettingsId = 1;
      mediaItem = createMediaItem({ type: 'show' });
      mockedSonarrApi = mockSonarrApi();
    });

    it('should use merged diskspace data for targeted remaining space rules', async () => {
      const getDiskspaceWithRootFoldersSpy = jest
        .spyOn(mockedSonarrApi, 'getDiskspaceWithRootFolders')
        .mockResolvedValue([
          createArrDiskspaceResource({
            path: '/tv',
            freeSpace: 12 * 1073741824,
            hasAccurateTotalSpace: false,
          }),
        ]);
      const getDiskspaceSpy = jest.spyOn(mockedSonarrApi, 'getDiskspace');

      const response = await sonarrGetterService.get(
        28,
        mediaItem,
        'show',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'show',
        }),
        createRuleDto({ arrDiskPath: '/tv/' }),
      );

      expect(response).toBe(12);
      expect(getDiskspaceWithRootFoldersSpy).toHaveBeenCalled();
      expect(getDiskspaceSpy).not.toHaveBeenCalled();
    });

    it('should return null for total space when the target only exists as a fallback path', async () => {
      const getDiskspaceSpy = jest
        .spyOn(mockedSonarrApi, 'getDiskspace')
        .mockResolvedValue([
          createArrDiskspaceResource({
            path: '/config',
            totalSpace: 200 * 1073741824,
          }),
        ]);
      const getDiskspaceWithRootFoldersSpy = jest.spyOn(
        mockedSonarrApi,
        'getDiskspaceWithRootFolders',
      );

      const response = await sonarrGetterService.get(
        29,
        mediaItem,
        'show',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'show',
        }),
        createRuleDto({ arrDiskPath: '/tv' }),
      );

      expect(response).toBeNull();
      expect(getDiskspaceSpy).toHaveBeenCalled();
      expect(getDiskspaceWithRootFoldersSpy).not.toHaveBeenCalled();
    });
  });

  describe('metadata fallback (series absent from Sonarr)', () => {
    let collectionMedia: CollectionMedia;
    let mediaItem: MediaItem;
    let mockedSonarrApi: SonarrApi;

    beforeEach(() => {
      collectionMedia = createCollectionMedia('show');
      collectionMedia.collection.sonarrSettingsId = 1;
      mediaItem = createMediaItem({ type: 'show', title: 'Sample Series' });
      mockedSonarrApi = mockSonarrApi();
      // Default: Sonarr confirms the series isn't tracked (null), as opposed
      // to a transient error (undefined). Tests that need the error path
      // override this.
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(null as any);
    });

    const callGet = (propId: number) =>
      sonarrGetterService.get(
        propId,
        mediaItem,
        'show',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'show',
        }),
      );

    // The tv-detail resolution behind this fallback ran once per rule condition;
    // the run-scoped ArrLookupCache now memoizes it per show (#3285), mirroring
    // the candidate memo. A distinct key ('metadata:sonarr:details:') keeps it
    // from colliding with the {tvdb}-policy candidate resolution.
    describe('tv-detail resolution memoization (#3285)', () => {
      const callEnded = (arrLookupCache?: ArrLookupCache) =>
        sonarrGetterService.get(
          7, // 'ended' - reaches tryMetadataFallback's resolveIdsFromMediaItem
          mediaItem,
          'show',
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: 'show',
          }),
          undefined,
          arrLookupCache,
        );

      beforeEach(() => {
        metadataService.resolveIdsFromMediaItem.mockResolvedValue({
          type: 'tv',
          tvdb: 322399,
        } as any);
        metadataService.getDetails.mockResolvedValue({
          type: 'tv',
          ended: true,
        } as any);
      });

      it('resolves tv ids once per show across conditions sharing a run cache', async () => {
        const cache = new ArrLookupCache();

        await callEnded(cache);
        await callEnded(cache); // second condition, same show + same run cache

        expect(metadataService.resolveIdsFromMediaItem).toHaveBeenCalledTimes(
          1,
        );
      });

      it('re-resolves per call when no run cache is provided (unchanged behaviour)', async () => {
        await callEnded();
        await callEnded();

        expect(metadataService.resolveIdsFromMediaItem).toHaveBeenCalledTimes(
          2,
        );
      });

      it('evicts a non-tv resolution so a later condition retries (transient safety)', async () => {
        metadataService.resolveIdsFromMediaItem
          .mockResolvedValueOnce(undefined) // transient: nothing resolved
          .mockResolvedValue({ type: 'tv', tvdb: 322399 } as any);
        const cache = new ArrLookupCache();

        await callEnded(cache); // non-tv/undefined -> evicted from the memo
        await flushMicrotasks();
        await callEnded(cache); // retries instead of serving the stale result

        expect(metadataService.resolveIdsFromMediaItem).toHaveBeenCalledTimes(
          2,
        );
      });
    });

    it('returns 1 for ended when metadata says the show ended', async () => {
      metadataService.resolveIdsFromMediaItem.mockResolvedValue({
        type: 'tv',
        tvdb: 322399,
      } as any);
      metadataService.getDetails.mockResolvedValue({
        id: 322399,
        title: 'Sample Series',
        type: 'tv',
        externalIds: { type: 'tv', tvdb: 322399 },
        ended: true,
      } as any);

      // id 7 = 'ended'
      const response = await callGet(7);

      expect(response).toBe(1);
      expect(metadataService.getDetails).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tv', tvdb: 322399 }),
        'tv',
        { merge: true },
      );
    });

    it('returns 0 for ended when metadata says the show is continuing', async () => {
      metadataService.resolveIdsFromMediaItem.mockResolvedValue({
        type: 'tv',
        tvdb: 1,
      } as any);
      metadataService.getDetails.mockResolvedValue({
        id: 1,
        title: 'Sample Series',
        type: 'tv',
        externalIds: { type: 'tv', tvdb: 1 },
        ended: false,
      } as any);

      const response = await callGet(7);

      expect(response).toBe(0);
    });

    it('returns the season count from metadata at show level', async () => {
      metadataService.resolveIdsFromMediaItem.mockResolvedValue({
        type: 'tv',
        tvdb: 1,
      } as any);
      metadataService.getDetails.mockResolvedValue({
        id: 1,
        title: 'Sample Series',
        type: 'tv',
        externalIds: { type: 'tv', tvdb: 1 },
        seasonCount: 4,
      } as any);

      // id 5 = 'seasons' (show-level returns seasonCount)
      const response = await callGet(5);

      expect(response).toBe(4);
    });

    it('returns null for ended when neither Sonarr nor metadata can supply it', async () => {
      metadataService.resolveIdsFromMediaItem.mockResolvedValue(undefined);

      const response = await callGet(7);

      expect(response).toBeNull();
    });

    it('returns null for a Sonarr-only property even when metadata is available', async () => {
      metadataService.resolveIdsFromMediaItem.mockResolvedValue({
        type: 'tv',
        tvdb: 1,
      } as any);
      metadataService.getDetails.mockResolvedValue({
        id: 1,
        title: 'Sample Series',
        type: 'tv',
        externalIds: { type: 'tv', tvdb: 1 },
        ended: true,
      } as any);

      // id 9 = 'monitored' (Sonarr-only state, no metadata fallback)
      const response = await callGet(9);

      expect(response).toBeNull();
      expect(metadataService.getDetails).not.toHaveBeenCalled();
    });

    it('does NOT fall back when the Sonarr lookup itself fails (fail closed)', async () => {
      // Transient Sonarr outage: getSeriesByTvdbId returns undefined, not null.
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(undefined as any);
      metadataService.resolveIdsFromMediaItem.mockResolvedValue({
        type: 'tv',
        tvdb: 1,
      } as any);
      metadataService.getDetails.mockResolvedValue({
        id: 1,
        title: 'Sample Series',
        type: 'tv',
        externalIds: { type: 'tv', tvdb: 1 },
        ended: true,
      } as any);

      const response = await callGet(7);

      // Returns undefined (comparator skips) - must NOT serve metadata's
      // 'ended: true' while Sonarr is unreachable, since that would change
      // collection membership during an outage.
      expect(response).toBeUndefined();
      expect(metadataService.getDetails).not.toHaveBeenCalled();
    });
  });

  describe('seriesTitle', () => {
    const callSeriesTitle = async (
      series: SonarrSeries | undefined,
      type: MediaItemType,
    ) => {
      const collectionMedia = createCollectionMedia(type);
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );

      mockSonarrApi(series);

      return sonarrGetterService.get(
        33,
        createMediaItem({
          type,
          ...(type === 'episode'
            ? { grandparentId: 'show-1', parentIndex: 1, index: 1 }
            : {}),
        }),
        type,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: type,
        }),
      );
    };

    it.each(['show', 'season', 'episode'] as const)(
      'returns the Sonarr series title for %s scope',
      async (type) => {
        const series = createSonarrSeries({ title: 'Sample Series' });
        const response = await callSeriesTitle(series, type);
        expect(response).toBe('Sample Series');
      },
    );

    it('returns null when Sonarr confirms the series is not tracked', async () => {
      // A series object without an id is the "confirmed not in Sonarr" shape
      // that `resolveSeries` translates to a present-but-empty record; it
      // routes the getter down the not-tracked path (no metadata fallback for
      // seriesTitle), which should surface null, not undefined.
      const response = await callSeriesTitle(
        createSonarrSeries({ id: undefined as any, title: undefined as any }),
        'episode',
      );
      expect(response).toBeNull();
    });

    it('returns null when the tracked series has no title', async () => {
      const response = await callSeriesTitle(
        createSonarrSeries({ title: undefined as any }),
        'episode',
      );
      expect(response).toBeNull();
    });
  });

  // Custom-agent libraries (sports, home video) emit no usable Guids, so no
  // external IDs resolve at all. The exact-title fallback lets rule
  // evaluation still reach the instance's own library, with the same
  // null/undefined fail-closed contract as the id path.
  describe('exact-title fallback (no resolvable external IDs)', () => {
    const callSeriesTitleWithoutIds = async (
      titleResult: SonarrSeries | null | undefined,
    ) => {
      const collectionMedia = createCollectionMedia('show');
      collectionMedia.collection.sonarrSettingsId = 1;
      metadataService.resolveLookupCandidatesFromMediaItemForService.mockResolvedValue(
        [],
      );

      const mockedSonarrApi = mockSonarrApi();
      jest
        .spyOn(mockedSonarrApi, 'getTrackedSeriesByExactTitle')
        .mockResolvedValue(titleResult);

      const response = await sonarrGetterService.get(
        33, // seriesTitle
        createMediaItem({ type: 'show', title: 'Formula 1' }),
        'show',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'show',
        }),
      );

      return { response, mockedSonarrApi };
    };

    it('resolves the series via an unambiguous exact-title match', async () => {
      const { response, mockedSonarrApi } = await callSeriesTitleWithoutIds(
        createSonarrSeries({ title: 'Formula 1' }),
      );

      expect(response).toBe('Formula 1');
      expect(mockedSonarrApi.getTrackedSeriesByExactTitle).toHaveBeenCalledWith(
        'Formula 1',
      );
      expect(mockedSonarrApi.getSeriesByTvdbId).not.toHaveBeenCalled();
    });

    it('returns null when no unambiguous tracked title match exists', async () => {
      const { response } = await callSeriesTitleWithoutIds(null);

      expect(response).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no unambiguous exact-title match'),
      );
    });

    it('fails closed when the title lookup itself errors', async () => {
      const { response } = await callSeriesTitleWithoutIds(undefined);

      expect(response).toBeUndefined();
    });

    it('prefers the title fallback over the metadata fallback when resolved IDs match nothing tracked', async () => {
      const collectionMedia = createCollectionMedia('show');
      collectionMedia.collection.sonarrSettingsId = 1;

      const mockedSonarrApi = mockSonarrApi();
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(null as any);
      jest
        .spyOn(mockedSonarrApi, 'getTrackedSeriesByExactTitle')
        .mockResolvedValue(createSonarrSeries({ title: 'Formula 1' }));

      const response = await sonarrGetterService.get(
        33, // seriesTitle
        createMediaItem({ type: 'show', title: 'Formula 1' }),
        'show',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'show',
        }),
      );

      expect(response).toBe('Formula 1');
    });
  });

  describe('seriesId', () => {
    const callSeriesId = async (
      series: SonarrSeries | undefined,
      type: MediaItemType,
    ) => {
      const collectionMedia = createCollectionMedia(type);
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );

      mockSonarrApi(series);

      return sonarrGetterService.get(
        34,
        createMediaItem({
          type,
          ...(type === 'episode'
            ? { grandparentId: 'show-1', parentIndex: 1, index: 1 }
            : {}),
        }),
        type,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: type,
        }),
      );
    };

    it.each(['show', 'season', 'episode'] as const)(
      'returns the Sonarr series id for %s scope',
      async (type) => {
        const series = createSonarrSeries({ id: 12345 });
        const response = await callSeriesId(series, type);
        expect(response).toBe(12345);
      },
    );

    it('returns null when Sonarr confirms the series is not tracked', async () => {
      const response = await callSeriesId(
        createSonarrSeries({ id: undefined as any }),
        'episode',
      );
      expect(response).toBeNull();
    });
  });

  describe('episodeFileRank', () => {
    const callRank = async (
      series: SonarrSeries,
      episodes: ReturnType<typeof createSonarrEpisode>[],
      target: { seasonNumber: number; episodeNumber: number },
      options: { arrLookupCache?: ArrLookupCache } = {},
    ) => {
      const collectionMedia = createCollectionMedia('episode');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );

      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue(episodes);

      const response = await sonarrGetterService.get(
        32,
        createMediaItem({
          type: 'episode',
          index: target.episodeNumber,
          parentIndex: target.seasonNumber,
          parentId: `season-${target.seasonNumber}`,
          grandparentId: 'show-1',
        }),
        'episode',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'episode',
        }),
        undefined,
        options.arrLookupCache,
      );

      return { response, mockedSonarrApi };
    };

    it('ranks an aired episode within its show by air date (newest = 1)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '2026-06-09T00:00:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 2,
          airDateUtc: '2026-06-10T00:00:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 3,
          airDateUtc: '2026-06-11T00:00:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 4,
          airDateUtc: '2026-06-12T00:00:00Z',
          hasFile: true,
        }),
      ];

      const { response } = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 3,
      });

      // Episode 4 is rank 1, 3 is rank 2, 2 is rank 3, 1 is rank 4.
      expect(response).toBe(2);
    });

    it('returns 1 for the only aired episode of a single-episode show', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '2026-06-12T00:00:00Z',
          hasFile: true,
        }),
      ];

      const { response } = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 1,
      });

      expect(response).toBe(1);
    });

    it('returns null when the rank pool is empty (new series with no aired episodes)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });

      const { response } = await callRank(series, [], {
        seasonNumber: 1,
        episodeNumber: 1,
      });

      expect(response).toBeNull();
    });

    it('returns null when every episode is still unaired (airDateUtc in the future)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '2026-07-01T00:00:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 2,
          airDateUtc: '2026-07-02T00:00:00Z',
          hasFile: true,
        }),
      ];

      const { response } = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 1,
      });

      expect(response).toBeNull();
    });

    it('excludes episodes whose airDateUtc is the Sonarr null-date sentinel (0001-01-01T00:00:00Z)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        // The sentinel parses to a finite, very-negative epoch ms and would
        // otherwise sneak into the pool with a bogus year-1 air date.
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '0001-01-01T00:00:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 2,
          airDateUtc: '2026-06-11T00:00:00Z',
          hasFile: true,
        }),
      ];

      const sentinel = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 1,
      });
      expect(sentinel.response).toBeNull();

      const aired = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 2,
      });
      expect(aired.response).toBe(1);
    });

    it('returns null for an evaluated specials episode (season 0 excluded from pool)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 0,
          episodeNumber: 1,
          airDateUtc: '2026-06-10T00:00:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 0,
          episodeNumber: 2,
          airDateUtc: '2026-06-11T00:00:00Z',
          hasFile: true,
        }),
      ];

      const { response } = await callRank(series, episodes, {
        seasonNumber: 0,
        episodeNumber: 1,
      });

      expect(response).toBeNull();
    });

    it('tiebreaks same-day air dates by (seasonNumber, episodeNumber) descending', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const sharedDate = '2026-06-12T00:00:00Z';
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 9,
          airDateUtc: sharedDate,
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 10,
          airDateUtc: sharedDate,
          hasFile: true,
        }),
      ];

      const resultE10 = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 10,
      });
      expect(resultE10.response).toBe(1);

      const resultE9 = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 9,
      });
      expect(resultE9.response).toBe(2);
    });

    it('returns undefined when the Sonarr series lookup itself fails (transient)', async () => {
      const collectionMedia = createCollectionMedia('episode');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );

      const mockedSonarrApi = mockSonarrApi();
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(undefined as any);

      const response = await sonarrGetterService.get(
        32,
        createMediaItem({
          type: 'episode',
          index: 1,
          parentIndex: 1,
          parentId: 'season-1',
          grandparentId: 'show-1',
        }),
        'episode',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'episode',
        }),
      );

      expect(response).toBeUndefined();
    });

    it('returns null when Sonarr confirms the series is not tracked', async () => {
      const collectionMedia = createCollectionMedia('episode');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );

      const mockedSonarrApi = mockSonarrApi();
      // Empty series object (no id) → Sonarr confirms not tracked.
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue({} as any);

      const response = await sonarrGetterService.get(
        32,
        createMediaItem({
          type: 'episode',
          index: 1,
          parentIndex: 1,
          parentId: 'season-1',
          grandparentId: 'show-1',
        }),
        'episode',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'episode',
        }),
      );

      expect(response).toBeNull();
    });

    it('memoises the episode list across calls within the same run', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '2026-06-11T00:00:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 2,
          airDateUtc: '2026-06-12T00:00:00Z',
          hasFile: true,
        }),
      ];

      const cache = new ArrLookupCache();
      const first = await callRank(
        series,
        episodes,
        { seasonNumber: 1, episodeNumber: 1 },
        { arrLookupCache: cache },
      );
      const second = await callRank(
        series,
        episodes,
        { seasonNumber: 1, episodeNumber: 2 },
        { arrLookupCache: cache },
      );

      expect(first.response).toBe(2);
      expect(second.response).toBe(1);
      // The second invocation reuses the cached episode-list promise produced
      // during the first invocation, so the second SonarrApi instance never
      // sees a getEpisodes call.
      expect(second.mockedSonarrApi.getEpisodes).not.toHaveBeenCalled();
    });

    it('excludes episodes with hasFile === false from the rank pool', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 1,
          airDateUtc: '2026-06-10T00:00:00Z',
          hasFile: true,
        }),
        // Aired and tracked in Sonarr but not on disk - must not get a rank
        // and must not push the downloaded episodes outside their own
        // "newest = 1" window.
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 2,
          airDateUtc: '2026-06-11T00:00:00Z',
          hasFile: false,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 1,
          episodeNumber: 3,
          airDateUtc: '2026-06-12T00:00:00Z',
          hasFile: true,
        }),
      ];

      const onDisk = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 3,
      });
      expect(onDisk.response).toBe(1);

      const olderOnDisk = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 1,
      });
      expect(olderOnDisk.response).toBe(2);

      const notOnDisk = await callRank(series, episodes, {
        seasonNumber: 1,
        episodeNumber: 2,
      });
      expect(notOnDisk.response).toBeNull();
    });

    const callDailyRank = async (
      series: SonarrSeries,
      episodes: ReturnType<typeof createSonarrEpisode>[],
      target: { parentIndex: number; originallyAvailableAt?: Date },
    ) => {
      const collectionMedia = createCollectionMedia('episode');
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );

      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue(episodes);

      return sonarrGetterService.get(
        32,
        createMediaItem({
          type: 'episode',
          // Plex daily-series episodes carry parentIndex (year) but no
          // index - explicitly clear the faker default.
          index: undefined,
          parentIndex: target.parentIndex,
          parentId: `season-${target.parentIndex}`,
          grandparentId: 'show-1',
          originallyAvailableAt: target.originallyAvailableAt,
        }),
        'episode',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'episode',
        }),
      );
    };

    it('falls back to airDate lookup for daily-series items with no episode number', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 100,
          airDate: '2026-06-09',
          airDateUtc: '2026-06-09T18:30:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 101,
          airDate: '2026-06-10',
          airDateUtc: '2026-06-10T18:30:00Z',
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 102,
          airDate: '2026-06-11',
          airDateUtc: '2026-06-11T18:30:00Z',
          hasFile: true,
        }),
      ];

      // Newest=1, so 2026-06-11 is rank 1, 2026-06-10 is rank 2,
      // 2026-06-09 is rank 3.
      const middle = await callDailyRank(series, episodes, {
        parentIndex: 2026,
        originallyAvailableAt: new Date('2026-06-10T00:00:00Z'),
      });
      expect(middle).toBe(2);

      const newest = await callDailyRank(series, episodes, {
        parentIndex: 2026,
        originallyAvailableAt: new Date('2026-06-11T00:00:00Z'),
      });
      expect(newest).toBe(1);
    });

    it('returns null when a daily-series item has no originallyAvailableAt', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 100,
          airDate: '2026-06-09',
          airDateUtc: '2026-06-09T18:30:00Z',
          hasFile: true,
        }),
      ];

      const response = await callDailyRank(series, episodes, {
        parentIndex: 2026,
        originallyAvailableAt: undefined,
      });
      expect(response).toBeNull();
    });

    it('returns null when a daily-series originallyAvailableAt is the .NET null sentinel', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 100,
          airDate: '2026-06-09',
          airDateUtc: '2026-06-09T18:30:00Z',
          hasFile: true,
        }),
      ];

      const response = await callDailyRank(series, episodes, {
        parentIndex: 2026,
        originallyAvailableAt: new Date('0001-01-01T00:00:00Z'),
      });
      expect(response).toBeNull();
    });

    it('uses first-wins on same-day collisions in the airDate fallback', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const sameDay = '2026-06-10';
      const episodes = [
        // Same-day double - newer (E102) should win the airDate slot,
        // matching the conservative-keep behaviour for ambiguous lookups.
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 101,
          airDate: sameDay,
          airDateUtc: `${sameDay}T17:00:00Z`,
          hasFile: true,
        }),
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 102,
          airDate: sameDay,
          airDateUtc: `${sameDay}T19:00:00Z`,
          hasFile: true,
        }),
      ];

      // Sort is desc by airMs then desc by S/E within ties, so the pool is
      // [E102 (rank 1), E101 (rank 2)]. The airDate map locks in rank 1
      // for the date.
      const response = await callDailyRank(series, episodes, {
        parentIndex: 2026,
        originallyAvailableAt: new Date(`${sameDay}T00:00:00Z`),
      });
      expect(response).toBe(1);
    });

    it('matches by broadcast-date string when airDateUtc straddles UTC midnight (US primetime case)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const series = createSonarrSeries({ id: 7, seasons: [] });
      // US primetime broadcast: 8pm Eastern on 2026-06-10 = 00:00 UTC
      // on 2026-06-11. Sonarr's `airDate` carries the local broadcast
      // date ('2026-06-10'); `airDateUtc` carries the UTC moment, which
      // falls on the next UTC day. Plex's `originallyAvailableAt` for
      // the same episode is the date-only string '2026-06-10' → parsed
      // as 2026-06-10T00:00:00Z. The map key must agree on the broadcast
      // date, not the UTC day of the moment.
      const episodes = [
        createSonarrEpisode({
          seriesId: series.id,
          seasonNumber: 2026,
          episodeNumber: 161,
          airDate: '2026-06-10',
          airDateUtc: '2026-06-11T00:00:00Z',
          hasFile: true,
        }),
      ];

      const response = await callDailyRank(series, episodes, {
        parentIndex: 2026,
        originallyAvailableAt: new Date('2026-06-10T00:00:00Z'),
      });

      expect(response).toBe(1);
    });
  });

  describe('seasonFileRank', () => {
    const callSeasonRank = async (
      episodes: ReturnType<typeof createSonarrEpisode>[],
      targetSeasonNumber: number,
      options: {
        arrLookupCache?: ArrLookupCache;
        dataType?: MediaItemType;
      } = {},
    ) => {
      const dataType = options.dataType ?? 'season';
      const collectionMedia = createCollectionMedia(dataType);
      collectionMedia.collection.sonarrSettingsId = 1;

      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );

      const series = createSonarrSeries({ id: 7, seasons: [] });
      const mockedSonarrApi = mockSonarrApi(series);
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue(episodes);

      const response = await sonarrGetterService.get(
        35,
        createMediaItem({
          type: dataType,
          index: targetSeasonNumber,
          parentId: 'show-1',
        }),
        dataType,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType,
        }),
        undefined,
        options.arrLookupCache,
      );

      return { response, mockedSonarrApi };
    };

    const seasonEpisodes = (
      seasonNumber: number,
      airDates: string[],
      hasFile = true,
    ) =>
      airDates.map((airDateUtc, i) =>
        createSonarrEpisode({
          seriesId: 7,
          seasonNumber,
          episodeNumber: i + 1,
          airDateUtc,
          hasFile,
        }),
      );

    it('ranks seasons by their newest downloaded episode air date (newest = 1)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const episodes = [
        ...seasonEpisodes(1, ['2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z']),
        ...seasonEpisodes(2, ['2025-01-01T00:00:00Z', '2025-02-01T00:00:00Z']),
        ...seasonEpisodes(3, ['2026-01-01T00:00:00Z']),
      ];

      expect((await callSeasonRank(episodes, 3)).response).toBe(1);
      expect((await callSeasonRank(episodes, 2)).response).toBe(2);
      expect((await callSeasonRank(episodes, 1)).response).toBe(3);
    });

    it('seasons without downloaded episodes take no rank slot', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      // Season 3 aired newest but has no files: season 2 must be rank 1 and
      // season 3 must rank null (fail-closed).
      const episodes = [
        ...seasonEpisodes(1, ['2024-01-01T00:00:00Z']),
        ...seasonEpisodes(2, ['2025-01-01T00:00:00Z']),
        ...seasonEpisodes(3, ['2026-01-01T00:00:00Z'], false),
      ];

      expect((await callSeasonRank(episodes, 2)).response).toBe(1);
      expect((await callSeasonRank(episodes, 1)).response).toBe(2);
      expect((await callSeasonRank(episodes, 3)).response).toBeNull();
    });

    it('returns null for specials (season 0 excluded from pool)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const episodes = [
        ...seasonEpisodes(0, ['2025-06-01T00:00:00Z']),
        ...seasonEpisodes(1, ['2025-01-01T00:00:00Z']),
      ];

      expect((await callSeasonRank(episodes, 0)).response).toBeNull();
      expect((await callSeasonRank(episodes, 1)).response).toBe(1);
    });

    it('returns null for a season whose only downloaded episodes are unaired', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const episodes = [
        ...seasonEpisodes(1, ['2025-01-01T00:00:00Z']),
        ...seasonEpisodes(2, ['2026-07-01T00:00:00Z']),
      ];

      expect((await callSeasonRank(episodes, 2)).response).toBeNull();
      expect((await callSeasonRank(episodes, 1)).response).toBe(1);
    });

    it('returns null for non-season data types', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const episodes = seasonEpisodes(1, ['2025-01-01T00:00:00Z']);

      const { response } = await callSeasonRank(episodes, 1, {
        dataType: 'show',
      });
      expect(response).toBeNull();
    });

    it('returns undefined when the episode list fetch fails transiently', async () => {
      const collectionMedia = createCollectionMedia('season');
      collectionMedia.collection.sonarrSettingsId = 1;
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const mockedSonarrApi = mockSonarrApi(series);
      jest
        .spyOn(mockedSonarrApi, 'getEpisodes')
        .mockResolvedValue(undefined as any);

      const response = await sonarrGetterService.get(
        35,
        createMediaItem({ type: 'season', index: 1, parentId: 'show-1' }),
        'season',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'season',
        }),
      );

      expect(response).toBeUndefined();
    });

    it('shares one cached episode fetch with episodeFileRank within a run', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-06-13T12:00:00Z'));
      const episodes = [
        ...seasonEpisodes(1, ['2025-01-01T00:00:00Z']),
        ...seasonEpisodes(2, ['2026-01-01T00:00:00Z']),
      ];
      const cache = new ArrLookupCache();

      const first = await callSeasonRank(episodes, 2, {
        arrLookupCache: cache,
      });
      expect(first.response).toBe(1);

      // Same run: an episodeFileRank evaluation reuses the cached maps, so
      // the second SonarrApi instance never fetches episodes.
      const collectionMedia = createCollectionMedia('episode');
      collectionMedia.collection.sonarrSettingsId = 1;
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'show' }),
      );
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const secondApi = mockSonarrApi(series);
      jest.spyOn(secondApi, 'getEpisodes').mockResolvedValue(episodes);

      const response = await sonarrGetterService.get(
        32,
        createMediaItem({
          type: 'episode',
          index: 1,
          parentIndex: 2,
          parentId: 'season-2',
          grandparentId: 'show-1',
        }),
        'episode',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'episode',
        }),
        undefined,
        cache,
      );

      expect(response).toBe(1);
      expect(secondApi.getEpisodes).not.toHaveBeenCalled();
    });
  });

  const mockSonarrApi = (series?: SonarrSeries) => {
    const mockedSonarrApi = new SonarrApi(
      { url: 'http://localhost:8989', apiKey: 'test' },
      logger as any,
    );
    const mockedServarrService = new ServarrService({} as any, logger as any);
    jest
      .spyOn(mockedServarrService, 'getSonarrApiClient')
      .mockResolvedValue(mockedSonarrApi);

    if (series) {
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockResolvedValue(series);
    } else {
      jest
        .spyOn(mockedSonarrApi, 'getSeriesByTvdbId')
        .mockImplementation(jest.fn());
    }

    // Default: no unambiguous exact-title match. Tests exercising the
    // title fallback override this.
    jest
      .spyOn(mockedSonarrApi, 'getTrackedSeriesByExactTitle')
      .mockResolvedValue(null);

    servarrService.getSonarrApiClient.mockResolvedValue(mockedSonarrApi);

    return mockedSonarrApi;
  };
});
