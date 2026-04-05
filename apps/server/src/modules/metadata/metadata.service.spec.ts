import { MetadataProviderPreference } from '@maintainerr/contracts';
import { createMediaItem } from '../../../test/utils/data';
import { MaintainerrLogger } from '../logging/logs.service';
import { IMetadataProvider } from './interfaces/metadata-provider.interface';
import { MetadataService } from './metadata.service';

describe('MetadataService', () => {
  const createService = ({
    tmdbDetails,
    tvdbMovieId = 202,
    mediaServer = {
      getMetadata: jest.fn(),
    },
  }: {
    tmdbDetails?: {
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
  }) => {
    const tmdbProvider: IMetadataProvider = {
      name: 'TMDB',
      idKey: 'tmdb',
      isAvailable: () => true,
      extractId: (ids) => (typeof ids.tmdb === 'number' ? ids.tmdb : undefined),
      assignId: (ids, id) => {
        ids.tmdb = id;
      },
      getDetails: jest.fn().mockResolvedValue(
        tmdbDetails
          ? {
              id: 101,
              title: 'Home Alone',
              type: 'movie',
              ...tmdbDetails,
            }
          : undefined,
      ),
      getPosterUrl: jest.fn().mockResolvedValue('https://tmdb/poster.jpg'),
      getBackdropUrl: jest.fn().mockResolvedValue('https://tmdb/backdrop.jpg'),
      getPersonDetails: jest.fn(),
      findByExternalId: jest.fn().mockResolvedValue(undefined),
    };

    const tvdbProvider: IMetadataProvider = {
      name: 'TVDB',
      idKey: 'tvdb',
      isAvailable: () => true,
      extractId: (ids) => (typeof ids.tvdb === 'number' ? ids.tvdb : undefined),
      assignId: (ids, id) => {
        ids.tvdb = id;
      },
      getDetails: jest.fn().mockResolvedValue(undefined),
      getPosterUrl: jest.fn().mockResolvedValue('https://tvdb/poster.jpg'),
      getBackdropUrl: jest.fn().mockResolvedValue('https://tvdb/backdrop.jpg'),
      getPersonDetails: jest.fn(),
      findByExternalId: jest.fn().mockImplementation((externalId, type) => {
        if (type === 'imdb' && externalId === 'tt0099785') {
          return Promise.resolve([{ movieId: tvdbMovieId }]);
        }

        return Promise.resolve(undefined);
      }),
    };

    const logger = {
      setContext: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as MaintainerrLogger;
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue(mediaServer),
    };

    const service = new MetadataService(
      [tmdbProvider, tvdbProvider],
      mediaServerFactory as never,
      {
        metadata_provider_preference: MetadataProviderPreference.TVDB_PRIMARY,
      } as never,
      logger,
    );
    service.onApplicationBootstrap();

    return {
      service,
      tmdbProvider,
      tvdbProvider,
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
      title: 'Home Alone',
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
});
