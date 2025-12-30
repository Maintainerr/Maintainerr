import { Mocked, TestBed } from '@suites/unit';
import {
  createCollectionMedia,
  createPlexLibraryItem,
  createPlexMetadata,
  createRulesDto,
  createSonarrEpisode,
  createSonarrEpisodeFile,
  createSonarrSeries,
  EPlexDataTypeToPlexTypeMap,
} from '../../../../test/utils/data';
import { EMediaDataType } from '@maintainerr/contracts';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import { SonarrApi } from '../../api/servarr-api/helpers/sonarr.helper';
import { SonarrSeries } from '../../api/servarr-api/interfaces/sonarr.interface';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { CollectionMedia } from '../../collections/entities/collection_media.entities';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SonarrGetterService } from './sonarr-getter.service';

describe('SonarrGetterService', () => {
  let sonarrGetterService: SonarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let plexApi: Mocked<PlexApiService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SonarrGetterService).compile();

    sonarrGetterService = unit;

    servarrService = unitRef.get(ServarrService);
    plexApi = unitRef.get(PlexApiService);
    logger = unitRef.get(MaintainerrLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('part_of_latest_season', () => {
    it.each([
      { type: EMediaDataType.SEASONS, title: 'SEASONS' },
      {
        type: EMediaDataType.EPISODES,
        title: 'EPISODES',
      },
    ])(
      'should return true when next season has not started airing yet for $title',
      async ({ type }: { type: EMediaDataType }) => {
        jest.useFakeTimers().setSystemTime(new Date('2025-01-01'));

        const collectionMedia = createCollectionMedia(type);
        collectionMedia.collection.sonarrSettingsId = 1;

        plexApi.getMetadata.mockResolvedValue(
          createPlexMetadata({
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

        const plexLibraryItem = createPlexLibraryItem(
          type == EMediaDataType.EPISODES ? 'episode' : 'season',
          {
            index: 1,
            parentIndex: type == EMediaDataType.EPISODES ? 1 : undefined, // For episode, target parent (season)
          },
        );

        const response = await sonarrGetterService.get(
          13,
          plexLibraryItem,
          type,
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: type,
          }),
        );

        expect(response).toBe(true);
      },
    );

    describe('part_of_latest_season', () => {
      it.each([
        { type: EMediaDataType.SEASONS, title: 'SEASONS' },
        {
          type: EMediaDataType.EPISODES,
          title: 'EPISODES',
        },
      ])(
        'should return false when a later season has aired for $title',
        async ({ type }: { type: EMediaDataType }) => {
          jest.useFakeTimers().setSystemTime(new Date('2025-06-01'));

          const collectionMedia = createCollectionMedia(type);
          collectionMedia.collection.sonarrSettingsId = 1;

          plexApi.getMetadata.mockResolvedValue(
            createPlexMetadata({
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

          const plexLibraryItem = createPlexLibraryItem(
            type == EMediaDataType.EPISODES ? 'episode' : 'season',
            {
              index: 1,
              parentIndex: type == EMediaDataType.EPISODES ? 1 : undefined, // For episode, target parent (season)
            },
          );

          const response = await sonarrGetterService.get(
            13,
            plexLibraryItem,
            type,
            createRulesDto({
              collection: collectionMedia.collection,
              dataType: type,
            }),
          );

          expect(response).toBe(false);
        },
      );
    });
  });

  describe('fileQualityCutoffMet', () => {
    let collectionMedia: CollectionMedia;
    let mockedSonarrApi: SonarrApi;
    let series: SonarrSeries;
    let plexLibraryItem: PlexLibraryItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia(EMediaDataType.EPISODES);
      collectionMedia.collection.sonarrSettingsId = 1;
      plexApi.getMetadata.mockResolvedValue(
        createPlexMetadata({
          type: 'show',
        }),
      );
      series = createSonarrSeries();
      mockedSonarrApi = mockSonarrApi(series);
      plexLibraryItem = createPlexLibraryItem('episode');
    });

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
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
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
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
        }),
      );

      expect(response).toBe(false);
    });

    it('should return false when no episode file exists', async () => {
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([]);

      const response = await sonarrGetterService.get(
        23,
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
        }),
      );

      expect(response).toBe(false);
    });
  });

  describe('fileQualityName', () => {
    let collectionMedia: CollectionMedia;
    let mockedSonarrApi: SonarrApi;
    let series: SonarrSeries;
    let plexLibraryItem: PlexLibraryItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia(EMediaDataType.EPISODES);
      collectionMedia.collection.sonarrSettingsId = 1;
      plexApi.getMetadata.mockResolvedValue(
        createPlexMetadata({
          type: 'show',
        }),
      );
      series = createSonarrSeries();
      mockedSonarrApi = mockSonarrApi(series);
      plexLibraryItem = createPlexLibraryItem('episode');
    });

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
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
        }),
      );

      expect(response).toBe('WEBDL-1080p');
    });

    it('should return null when no episode file exists', async () => {
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([]);

      const response = await sonarrGetterService.get(
        24,
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
        }),
      );

      expect(response).toBe(null);
    });
  });

  describe('qualityProfileName', () => {
    it.each([
      { type: EMediaDataType.SEASONS, title: 'SEASONS' },
      {
        type: EMediaDataType.SHOWS,
        title: 'SHOWS',
      },
      {
        type: EMediaDataType.EPISODES,
        title: 'EPISODES',
      },
    ])(
      'should return show quality name for $title',
      async ({ type }: { type: EMediaDataType }) => {
        const collectionMedia = createCollectionMedia(EMediaDataType.EPISODES);
        collectionMedia.collection.sonarrSettingsId = 1;
        plexApi.getMetadata.mockResolvedValue(
          createPlexMetadata({
            type: 'show',
          }),
        );
        const plexLibraryItem = createPlexLibraryItem(
          EPlexDataTypeToPlexTypeMap[type],
        );
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
          plexLibraryItem,
          type,
          createRulesDto({
            collection: collectionMedia.collection,
            dataType: type,
          }),
        );

        expect(response).toBe('WEBDL-720p');
      },
    );
  });

  describe('fileAudioLanguages', () => {
    let collectionMedia: CollectionMedia;
    let mockedSonarrApi: SonarrApi;
    let series: SonarrSeries;
    let plexLibraryItem: PlexLibraryItem;

    beforeEach(() => {
      collectionMedia = createCollectionMedia(EMediaDataType.EPISODES);
      collectionMedia.collection.sonarrSettingsId = 1;
      plexApi.getMetadata.mockResolvedValue(
        createPlexMetadata({
          type: 'show',
        }),
      );
      series = createSonarrSeries();
      mockedSonarrApi = mockSonarrApi(series);
      plexLibraryItem = createPlexLibraryItem('episode');
    });

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
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
        }),
      );

      expect(response).toBe('eng');
    });

    it('should return null when no episode file exists', async () => {
      jest.spyOn(mockedSonarrApi, 'getEpisodes').mockResolvedValue([]);

      const response = await sonarrGetterService.get(
        26,
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
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
        plexLibraryItem,
        EMediaDataType.EPISODES,
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: EMediaDataType.EPISODES,
        }),
      );

      expect(response).toBe(null);
    });
  });

  const mockSonarrApi = (series?: SonarrSeries) => {
    const mockedSonarrApi = new SonarrApi({} as any, logger as any);
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
