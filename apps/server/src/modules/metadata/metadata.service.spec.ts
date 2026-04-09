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
      service.resolveIdsFromMediaItemWithLookupPolicy(
        item,
        invalidLookupPolicy,
      ),
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

  it('accepts direct provider ids when titles differ but release years agree', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-1',
      type: 'movie',
      year: 2025,
      title: 'The Fixture Quartet: Prologue',
      providerIds: {
        tmdb: ['900001'],
        imdb: [],
        tvdb: [],
      },
    });
    const { service, logger, mediaServer } = createService({
      tmdbDetails: {
        title: 'The Fixture 4: Prologue',
        year: 2025,
        type: 'movie',
        externalIds: {
          tmdb: 900001,
          type: 'movie',
        },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(mediaServer.getMetadata).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      tmdb: 900001,
      type: 'movie',
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rejects direct provider ids when no configured provider confirms the release year', async () => {
    const libraryItem = createMediaItem({
      id: 'show-1',
      type: 'show',
      year: 2025,
      title: 'Fixture Chronicle',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Unrelated Series',
        year: 2014,
        type: 'tv',
        externalIds: {
          tmdb: 771,
          type: 'tv',
        },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Rejected direct provider IDs for media server item "Fixture Chronicle" (2025) because no configured metadata provider confirmed the release year. Disagreements: TMDB returned 2014. The media server likely has incorrect metadata for this item, so no external IDs will be returned from this resolution attempt.',
    );
  });

  it('accepts direct provider ids when the media server item has no year signal to reject with', async () => {
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

  it('accepts direct provider ids when a parenthesized year in the title matches the provider year', async () => {
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

  // Cross-provider fallback: when the primary provider disagrees with the
  // media server year, the next configured provider gets a chance to vouch
  // for the ID before we reject.
  it('accepts direct ids via the secondary provider when the primary disagrees on year', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-fallback-1',
      type: 'movie',
      year: 2099,
      title: 'Fixture Runners',
      providerIds: { tmdb: ['777001'], imdb: [], tvdb: ['888001'] },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Runners',
        year: 2096,
        type: 'movie',
        externalIds: { tmdb: 777001, type: 'movie' },
      },
      tvdbDetails: {
        title: 'Fixture Runners',
        year: 2099,
        type: 'movie',
        externalIds: { tvdb: 888001, type: 'movie' },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toMatchObject({ tvdb: 888001, type: 'movie' });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rejects direct ids when every configured provider disagrees on year', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-fallback-2',
      type: 'movie',
      year: 2099,
      title: 'Fixture Runners',
      providerIds: { tmdb: ['777002'], imdb: [], tvdb: ['888002'] },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Runners',
        year: 2096,
        type: 'movie',
        externalIds: { tmdb: 777002, type: 'movie' },
      },
      tvdbDetails: {
        title: 'Fixture Runners',
        year: 2096,
        type: 'movie',
        externalIds: { tvdb: 888002, type: 'movie' },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TMDB returned 2096'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TVDB returned 2096'),
    );
  });

  // Re-scan mixup: a newer library item wrongly tagged with an older entry's
  // id. Titles are literally identical — only the year distinguishes them.
  // This is the case a title-first policy would silently accept.
  it('rejects a rescan id mixup where titles match exactly but years differ', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-rescan-mixup',
      type: 'movie',
      year: 2099,
      title: 'Fixture Road',
      providerIds: { tmdb: ['444111'], imdb: [], tvdb: [] },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Road',
        year: 2091,
        type: 'movie',
        externalIds: { tmdb: 444111, type: 'movie' },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('(2099)'));
  });

  // Stale direct IDs must still be corrected to the provider's canonical
  // ID when the provider's returned externalIds expose a different value
  // for that same provider (e.g. a merged/redirected TMDB entry).
  it('corrects a stale direct id when the provider returns a different canonical id', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-stale-id',
      type: 'movie',
      year: 2099,
      title: 'Fixture Harbor',
      providerIds: { tmdb: ['111'], imdb: [], tvdb: [] },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Harbor',
        year: 2099,
        type: 'movie',
        externalIds: { tmdb: 222, type: 'movie' },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toMatchObject({ tmdb: 222, type: 'movie' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Corrected TMDB ID: 111 to 222'),
    );
  });

  // Second-opinion path: the media item exposes only TMDB + IMDB tags.
  // TMDB disagrees on year. TVDB has no direct id on the item but can be
  // reached via the IMDB id, and when consulted it vouches for the year.
  // The validation flow should bridge IMDB -> TVDB, then accept.
  it('bridges to a secondary provider via imdb when the primary disagrees on year', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-bridge-1',
      type: 'movie',
      year: 2099,
      title: 'Fixture Beacon',
      providerIds: { tmdb: ['333'], imdb: ['tt0099785'], tvdb: [] },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Beacon',
        year: 2096,
        type: 'movie',
        externalIds: { tmdb: 333, type: 'movie' },
      },
      tvdbDetails: {
        title: 'Fixture Beacon',
        year: 2099,
        type: 'movie',
        externalIds: { tvdb: 555, type: 'movie' },
      },
      tvdbMovieId: 555,
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toMatchObject({ tvdb: 555, type: 'movie' });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // ±1 year tolerance: festival premiere vs theatrical release and similar
  // regional drift routinely produce a single-year gap between the media
  // server and TMDB/TVDB. Single-year gaps are accepted; larger gaps are
  // still rejected.
  it('accepts direct ids with a logged note when the provider year differs by exactly one year', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-year-tolerance',
      type: 'movie',
      year: 2099,
      title: 'Fixture Premiere',
      providerIds: { tmdb: ['606001'], imdb: [], tvdb: [] },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Premiere',
        year: 2098,
        type: 'movie',
        externalIds: { tmdb: 606001, type: 'movie' },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toMatchObject({ tmdb: 606001, type: 'movie' });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('one-year drift'),
    );
  });

  it('rejects direct ids when the provider year differs by more than one year', async () => {
    const libraryItem = createMediaItem({
      id: 'movie-year-outside-tolerance',
      type: 'movie',
      year: 2099,
      title: 'Fixture Premiere',
      providerIds: { tmdb: ['606002'], imdb: [], tvdb: [] },
    });
    const { service, logger } = createService({
      tmdbDetails: {
        title: 'Fixture Premiere',
        year: 2097,
        type: 'movie',
        externalIds: { tmdb: 606002, type: 'movie' },
      },
    });

    const result = await service.resolveIdsFromMediaItem(libraryItem);

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TMDB returned 2097'),
    );
  });
});
