import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { Mocked, TestBed } from '@suites/unit';
import {
  createCollectionMedia,
  createMediaItem,
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
import { SonarrGetterService } from './sonarr-getter.service';

describe('SonarrGetterService', () => {
  let sonarrGetterService: SonarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mockMediaServer: {
    getMetadata: jest.Mock<Promise<MediaItem>, [string]>;
  };
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SonarrGetterService).compile();

    sonarrGetterService = unit;

    servarrService = unitRef.get(ServarrService);
    mediaServerFactory = unitRef.get(MediaServerFactory);
    logger = unitRef.get(MaintainerrLogger);

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
