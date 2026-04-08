import { MetadataProviderPreference } from '@maintainerr/contracts';
import {
  createMediaItem,
  createMetadataProviderMock,
  createMockLogger,
  metadataLookupServiceTestCases,
  MetadataProviderMockConfig,
} from '../../../test/utils/data';
import { MaintainerrLogger } from '../logging/logs.service';
import { IMetadataProvider } from './interfaces/metadata-provider.interface';
import { MetadataService } from './metadata.service';

describe('MetadataService', () => {
  const createService = ({
    tmdbDetails,
    tvdbDetails,
    tvdbMovieId = 202,
    mediaServer = {
      getMetadata: jest.fn(),
    },
    providerMocks,
  }: {
    tmdbDetails?: {
      title?: string;
      year?: number;
      type?: 'movie' | 'tv';
      externalIds?: {
        tmdb?: number;
        imdb?: string;
        tvdb?: number;
        type: 'movie' | 'tv';
      };
    };
    tvdbDetails?: {
      title?: string;
      year?: number;
      type?: 'movie' | 'tv';
      externalIds?: {
        tmdb?: number;
        imdb?: string;
        tvdb?: number;
        type: 'movie' | 'tv';
      };
    };
    mediaServer?: {
      getMetadata: jest.Mock;
    };
    tvdbMovieId?: number;
    providerMocks?: MetadataProviderMockConfig[];
  }) => {
    const providers = (
      providerMocks ?? [
        {
          name: 'TMDB',
          idKey: 'tmdb',
          details: tmdbDetails,
          detailsId: 101,
          posterUrl: 'https://tmdb/poster.jpg',
          backdropUrl: 'https://tmdb/backdrop.jpg',
        },
        {
          name: 'TVDB',
          idKey: 'tvdb',
          details: tvdbDetails,
          detailsId: tvdbMovieId,
          posterUrl: 'https://tvdb/poster.jpg',
          backdropUrl: 'https://tvdb/backdrop.jpg',
          findByExternalId: async (externalId, type) => {
            if (type === 'imdb' && externalId === 'tt0099785') {
              return [{ movieId: tvdbMovieId }];
            }

            return undefined;
          },
        },
      ]
    ).map((config) => createMetadataProviderMock(config));

    const providerByKey = Object.fromEntries(
      providers.map((provider) => [provider.idKey, provider]),
    ) as Record<string, jest.Mocked<IMetadataProvider>>;

    const tmdbProvider = providerByKey.tmdb;
    const tvdbProvider = providerByKey.tvdb;
    const logger = createMockLogger() as unknown as MaintainerrLogger;
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };

    const service = new MetadataService(
      providers,
      mediaServerFactory as never,
      {
        metadata_provider_preference: MetadataProviderPreference.TVDB_PRIMARY,
      } as never,
      logger,
    );
    service.onApplicationBootstrap();

    return {
      service,
      providers,
      providerByKey,
      tmdbProvider,
      tvdbProvider,
      logger,
      mediaServer,
      mediaServerFactory,
    };
  };

  it('resolves a missing TVDB movie id from imdb before selecting the preferred poster provider', async () => {
    const ids = {
      tmdb: 771,
      imdb: 'tt0099785',
    };
    const { service, tmdbProvider, tvdbProvider } = createService({
      tmdbDetails: {
        externalIds: {
          tmdb: 771,
          imdb: 'tt0099785',
          type: 'movie',
        },
      },
    });

    const result = await service.getPosterUrl(ids, 'movie');

    expect(result).toEqual({
      url: 'https://tvdb/poster.jpg',
      provider: 'TVDB',
      id: 202,
    });
    expect(ids).toEqual({
      tmdb: 771,
      imdb: 'tt0099785',
      tvdb: 202,
    });
    expect(tvdbProvider.findByExternalId).toHaveBeenCalledWith(
      'tt0099785',
      'imdb',
    );
    expect(tvdbProvider.getPosterUrl).toHaveBeenCalledWith(
      202,
      'movie',
      'w500',
    );
    expect(tmdbProvider.getPosterUrl).not.toHaveBeenCalled();
  });

  it.each(metadataLookupServiceTestCases)(
    '$title',
    async ({
      service: targetService,
      lookupPolicy,
      libraryItem,
      providerMocks,
      expectedCandidates,
    }) => {
      const { service } = createService({
        providerMocks,
      });
      const item = createMediaItem(libraryItem);

      await expect(
        service.resolveLookupCandidatesFromMediaItem(item, lookupPolicy),
      ).resolves.toEqual(expectedCandidates);
      await expect(
        service.resolveLookupCandidatesFromMediaItemForService(
          item,
          targetService,
        ),
      ).resolves.toEqual(expectedCandidates);
    },
  );

  it('resolves a Seerr TMDB id from a direct TVDB id when the TVDB provider is unavailable', async () => {
    const { service, providerByKey } = createService({
      providerMocks: [
        {
          name: 'TMDB',
          idKey: 'tmdb',
          findByExternalId: async (externalId, type) => {
            if (type === 'tvdb' && externalId === 303) {
              return [{ tvShowId: 404 }];
            }

            return undefined;
          },
        },
        {
          name: 'TVDB',
          idKey: 'tvdb',
          isAvailable: false,
        },
      ],
    });
    const item = createMediaItem({
      id: 'show-seerr-1',
      type: 'show',
      title: 'Fixture Story',
      providerIds: {
        tmdb: [],
        imdb: [],
        tvdb: ['303'],
      },
    });

    await expect(
      service.resolveIdsFromMediaItemForService(item, 'seerr'),
    ).resolves.toMatchObject({
      tmdb: 404,
      tvdb: 303,
      type: 'tv',
    });
    expect(providerByKey.tmdb.findByExternalId).toHaveBeenCalledWith(
      303,
      'tvdb',
    );
  });

  it('fails closed when a lookup policy only references unsupported providers', async () => {
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Story',
        type: 'movie',
        externalIds: {
          tmdb: 771,
          type: 'movie',
        },
      },
    });
    const item = createMediaItem({
      id: 'movie-invalid-policy-1',
      type: 'movie',
      title: 'Fixture Story',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const invalidLookupPolicy = {
      providerKeys: ['invalid-provider'],
      providerMatchMode: 'any' as const,
    };

    await expect(
      service.resolveLookupCandidatesFromMediaItem(item, invalidLookupPolicy),
    ).resolves.toEqual([]);
    await expect(
      service.resolveIdsFromMediaItemWithLookupPolicy(item, invalidLookupPolicy),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Metadata lookup policy references only unsupported providers: invalid-provider',
    );
  });

  it('resolves ids from hierarchy metadata when a child media item is provided', async () => {
    const episodeItem = createMediaItem({
      id: 'episode-1',
      type: 'episode',
      parentId: 'season-1',
      grandparentId: 'show-1',
      providerIds: {},
    });
    const showItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      title: 'Fixture Story',
      providerIds: { tmdb: ['771'] },
    });
    const mediaServer = {
      getMetadata: jest.fn().mockImplementation(async (id: string) => {
        if (id === 'show-1') {
          return showItem;
        }

        return undefined;
      }),
    };
    const { service } = createService({
      mediaServer,
      tmdbDetails: {
        externalIds: {
          tmdb: 771,
          imdb: 'tt0099785',
          type: 'tv',
        },
      },
    });

    const result = await service.resolveIdsFromHierarchyMediaItem(episodeItem);

    expect(mediaServer.getMetadata).toHaveBeenCalledWith('show-1');
    expect(result).toMatchObject({
      tmdb: 771,
      type: 'tv',
    });
  });

  it('accepts direct provider ids without fetching details when the title suffix already provides the matching year', async () => {
    const libraryItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: undefined,
      title: 'Fixture Chronicle (2025)',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const detailItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: 2025,
      title: 'Fixture Chronicle (2025)',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue(detailItem),
    };
    const { service, logger } = createService({
      mediaServer,
      tmdbDetails: {
        title: 'Fixture Chronicle',
        year: 2025,
        type: 'tv',
        externalIds: {
          tmdb: 771,
          type: 'tv',
        },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(mediaServer.getMetadata).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      tmdb: 771,
      type: 'tv',
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Title mismatch resolved by year-aware match for media server item "Fixture Chronicle (2025)" against "Fixture Chronicle".',
    );
  });

  it('still rejects direct provider ids after fetching details when the title suffix year disagrees', async () => {
    const libraryItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: undefined,
      title: 'Fixture Chronicle (2025)',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const detailItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: 2025,
      title: 'Fixture Chronicle (2025)',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue(detailItem),
    };
    const { service, logger } = createService({
      mediaServer,
      tmdbDetails: {
        title: 'Fixture Chronicle',
        year: 2024,
        type: 'tv',
        externalIds: {
          tmdb: 771,
          type: 'tv',
        },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(mediaServer.getMetadata).toHaveBeenCalledWith('show-1');
    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected direct provider IDs for media server item "Fixture Chronicle (2025)" because they resolved to "Fixture Chronicle" instead. The media server likely has incorrect metadata for this item, so no external IDs will be returned from this resolution attempt.',
    );
  });

  it('fetches detail metadata when the initial item lacks a usable year signal', async () => {
    const libraryItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: undefined,
      title: 'Fixture Localized',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const detailItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: 2025,
      title: 'Fixture Chronicle (2025)',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const mediaServer = {
      getMetadata: jest.fn().mockResolvedValue(detailItem),
    };
    const { service, logger } = createService({
      mediaServer,
      tmdbDetails: {
        title: 'Fixture Chronicle',
        year: 2025,
        type: 'tv',
        externalIds: {
          tmdb: 771,
          type: 'tv',
        },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(mediaServer.getMetadata).toHaveBeenCalledWith('show-1');
    expect(result).toMatchObject({
      tmdb: 771,
      type: 'tv',
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Title mismatch resolved by year-aware match for media server item "Fixture Localized" against "Fixture Chronicle".',
    );
  });

  it('skips the detail lookup when the initial item already passes the year-aware title check', async () => {
    const libraryItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: 2025,
      title: 'Fixture Chronicle (2025)',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const { service, logger, mediaServer } = createService({
      tmdbDetails: {
        title: 'Fixture Chronicle',
        year: 2025,
        type: 'tv',
        externalIds: {
          tmdb: 771,
          type: 'tv',
        },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(mediaServer.getMetadata).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      tmdb: 771,
      type: 'tv',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('skips the detail lookup when the title already matches', async () => {
    const libraryItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      title: 'Fixture Chronicle',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const { service, mediaServer } = createService({
      tmdbDetails: {
        title: 'Fixture Chronicle',
        type: 'tv',
        externalIds: {
          tmdb: 771,
          type: 'tv',
        },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(mediaServer.getMetadata).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      tmdb: 771,
      type: 'tv',
    });
  });
});
