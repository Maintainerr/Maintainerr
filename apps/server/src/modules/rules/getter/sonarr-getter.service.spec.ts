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

    servarrService.getSonarrApiClient.mockResolvedValue(mockedSonarrApi);

    return mockedSonarrApi;
  };
});
