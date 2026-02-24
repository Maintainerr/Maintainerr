import { MetadataProviderPreference } from '@maintainerr/contracts';
import { IMetadataProvider } from './interfaces/metadata-provider.interface';
import { MetadataDetails } from './interfaces/metadata.types';
import { MetadataService } from './metadata.service';
import { createMediaItem, createMockLogger } from '../../../test/utils/data';

const createMockProvider = (
  name: string,
  available = true,
): jest.Mocked<IMetadataProvider> => ({
  name,
  isAvailable: jest.fn().mockReturnValue(available),
  extractId: jest.fn().mockImplementation((ids: Record<string, number>) => {
    return ids[`${name.toLowerCase()}Id`];
  }),
  assignId: jest.fn().mockImplementation((ids: Record<string, number>, id) => {
    ids[`${name.toLowerCase()}Id`] = id;
  }),
  getDetails: jest.fn(),
  getPosterUrl: jest.fn(),
  getBackdropUrl: jest.fn(),
  getPersonDetails: jest.fn(),
  findByExternalId: jest.fn(),
});

const createService = (
  preference = MetadataProviderPreference.TMDB_PRIMARY,
  providerOverrides?: jest.Mocked<IMetadataProvider>[],
) => {
  const tmdb = createMockProvider('TMDB');
  const tvdb = createMockProvider('TVDB');
  const providers = providerOverrides ?? [tmdb, tvdb];

  const mediaServerService = { getMetadata: jest.fn() };
  const service = new MetadataService(
    providers,
    { getService: jest.fn().mockResolvedValue(mediaServerService) } as any,
    { metadata_provider_preference: preference } as any,
    createMockLogger(),
  );
  service.onApplicationBootstrap();

  return { service, tmdb, tvdb, providers, mediaServerService };
};

describe('MetadataService', () => {
  it('respects provider preference order', async () => {
    const { service, tmdb, tvdb } = createService(
      MetadataProviderPreference.TVDB_PRIMARY,
    );
    const details: MetadataDetails = {
      id: 81189, title: 'Breaking Bad', type: 'tv',
      externalIds: { tvdbId: 81189, type: 'tv' },
    };
    tvdb.getDetails.mockResolvedValue(details);

    const result = await service.getDetails({ tvdbId: 81189 }, 'tv');

    expect(result).toEqual(details);
    expect(tmdb.getDetails).not.toHaveBeenCalled();
  });

  it('falls back to next provider when preferred returns undefined', async () => {
    const { service, tmdb, tvdb } = createService();
    tmdb.getDetails.mockResolvedValue(undefined);
    tvdb.getDetails.mockResolvedValue({
      id: 42, title: 'Fallback', type: 'movie',
      externalIds: { tvdbId: 42, type: 'movie' },
    });

    const result = await service.getDetails({ tmdbId: 1, tvdbId: 42 }, 'movie');

    expect(result?.title).toBe('Fallback');
    expect(tmdb.getDetails).toHaveBeenCalled();
    expect(tvdb.getDetails).toHaveBeenCalled();
  });

  it('skips unavailable providers entirely', async () => {
    const tmdb = createMockProvider('TMDB', false);
    const tvdb = createMockProvider('TVDB', true);
    const { service } = createService(
      MetadataProviderPreference.TMDB_PRIMARY,
      [tmdb, tvdb],
    );
    tvdb.getDetails.mockResolvedValue({
      id: 1, title: 'X', type: 'movie',
      externalIds: { tvdbId: 1, type: 'movie' },
    });

    await service.getDetails({ tmdbId: 1, tvdbId: 1 }, 'movie');

    expect(tmdb.getDetails).not.toHaveBeenCalled();
  });

  it('updates preference at runtime via settings event', async () => {
    const { service, tvdb } = createService(
      MetadataProviderPreference.TMDB_PRIMARY,
    );
    service.handleSettingsUpdate({
      settings: { metadata_provider_preference: MetadataProviderPreference.TVDB_PRIMARY },
    });
    tvdb.getDetails.mockResolvedValue({
      id: 1, title: 'X', type: 'tv',
      externalIds: { tvdbId: 1, type: 'tv' },
    });

    await service.getDetails({ tmdbId: 1, tvdbId: 1 }, 'tv');

    expect(tvdb.getDetails).toHaveBeenCalledWith(1, 'tv');
  });

  it('resolves cross-provider IDs via details lookup', async () => {
    const item = createMediaItem({
      type: 'movie',
      providerIds: { tmdb: ['550'] },
    });
    const { service, tmdb } = createService();
    tmdb.getDetails.mockResolvedValue({
      id: 550, title: 'Fight Club', type: 'movie',
      externalIds: { tmdbId: 550, tvdbId: 42, imdbId: 'tt0137523', type: 'movie' },
    });

    const result = await service.resolveIdsFromMediaItem(item);

    expect(result).toEqual(expect.objectContaining({ tmdbId: 550, tvdbId: 42 }));
  });

  it('returns poster url tagged with the serving provider', async () => {
    const { service, tmdb } = createService();
    tmdb.getPosterUrl.mockResolvedValue('https://image.tmdb.org/t/p/w500/poster.jpg');

    const result = await service.getPosterUrl({ tmdbId: 550 }, 'movie');

    expect(result).toEqual({
      url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      provider: 'TMDB',
    });
  });

  it('walks up hierarchy for episodes before resolving IDs', async () => {
    const episode = createMediaItem({
      type: 'episode', grandparentId: 'show-1', providerIds: {},
    });
    const show = createMediaItem({
      id: 'show-1', type: 'show',
      providerIds: { tmdb: ['1396'], tvdb: ['81189'] },
    });

    const { service, mediaServerService } = createService();
    mediaServerService.getMetadata
      .mockResolvedValueOnce(episode)
      .mockResolvedValueOnce(show);

    const result = await service.resolveIds('ep-1');

    expect(mediaServerService.getMetadata).toHaveBeenCalledWith('show-1');
    expect(result).toEqual(expect.objectContaining({ tmdbId: 1396, tvdbId: 81189 }));
  });

  it('walks up via parentId for seasons', async () => {
    const season = createMediaItem({
      type: 'season', parentId: 'show-2', providerIds: {},
    });
    const show = createMediaItem({
      id: 'show-2', type: 'show',
      providerIds: { tmdb: ['100'], tvdb: ['200'] },
    });

    const { service, mediaServerService } = createService();
    mediaServerService.getMetadata
      .mockResolvedValueOnce(season)
      .mockResolvedValueOnce(show);

    const result = await service.resolveIds('season-1');

    expect(mediaServerService.getMetadata).toHaveBeenCalledWith('show-2');
    expect(result).toEqual(expect.objectContaining({ tmdbId: 100, tvdbId: 200 }));
  });

  it('resolveIds returns undefined when media server returns null', async () => {
    const { service, mediaServerService } = createService();
    mediaServerService.getMetadata.mockResolvedValue(undefined);

    expect(await service.resolveIds('missing')).toBeUndefined();
  });

  it('resolveIds returns undefined on error', async () => {
    const { service, mediaServerService } = createService();
    mediaServerService.getMetadata.mockRejectedValue(new Error('boom'));

    expect(await service.resolveIds('bad')).toBeUndefined();
  });

  it('resolveIdsFromMediaItem returns undefined on error', async () => {
    const { service, tmdb } = createService();
    tmdb.extractId.mockImplementation(() => { throw new Error('oops'); });

    const item = createMediaItem({ type: 'movie', providerIds: { tmdb: ['1'] } });
    expect(await service.resolveIdsFromMediaItem(item)).toBeUndefined();
  });

  it('getBackdropUrl returns tagged result', async () => {
    const { service, tmdb } = createService();
    tmdb.getBackdropUrl.mockResolvedValue('https://img/bg.jpg');

    const result = await service.getBackdropUrl({ tmdbId: 1 }, 'movie');

    expect(result).toEqual({ url: 'https://img/bg.jpg', provider: 'TMDB' });
  });

  it('getPersonDetails delegates to provider', async () => {
    const { service, tmdb } = createService();
    tmdb.getPersonDetails.mockResolvedValue({ id: 1, name: 'Actor' } as any);

    const result = await service.getPersonDetails({ tmdbId: 1 });

    expect(result).toEqual(expect.objectContaining({ name: 'Actor' }));
  });

  it('resolveAllMovieIds falls back to full resolution when no direct tmdb IDs', async () => {
    // Item has only IMDB, no tmdb — collectDirectIds returns [], triggers fallback
    const item = createMediaItem({
      type: 'movie', providerIds: { imdb: ['tt999'] },
    });
    const { service, mediaServerService, tmdb, tvdb } = createService();
    mediaServerService.getMetadata.mockResolvedValue(
      createMediaItem({ providerIds: { imdb: ['tt999'] } }),
    );
    // resolveIdsFromMediaItem → resolveAllIds → fillIdsFromExternalSearch
    tmdb.findByExternalId.mockResolvedValue([{ movieId: 10 }]);
    tvdb.findByExternalId.mockResolvedValue([{ movieId: 20 }]);

    const ids = await service.resolveAllMovieIds(item);

    expect(ids).toContain(10);
  });

  it('resolveAllSeriesIds returns tvdb IDs directly', async () => {
    const item = createMediaItem({
      type: 'show', providerIds: { tvdb: ['300'] },
    });
    const { service } = createService();

    expect(await service.resolveAllSeriesIds(item)).toEqual([300]);
  });

  it('fillIdsFromExternalSearch assigns IDs from IMDB search', async () => {
    const item = createMediaItem({
      type: 'movie', providerIds: { imdb: ['tt999'] },
    });
    const { service, tmdb, tvdb } = createService();
    tmdb.getDetails.mockResolvedValue(undefined);
    tvdb.getDetails.mockResolvedValue(undefined);
    tmdb.findByExternalId.mockResolvedValue([{ movieId: 50 }]);
    tvdb.findByExternalId.mockResolvedValue([{ movieId: 60 }]);

    const result = await service.resolveIdsFromMediaItem(item);

    expect(result?.tmdbId).toBe(50);
    expect(result?.tvdbId).toBe(60);
  });

  it('skips resolveAllIds when both IDs already present', async () => {
    const item = createMediaItem({
      type: 'movie', providerIds: { tmdb: ['1'], tvdb: ['2'] },
    });
    const { service, tmdb } = createService();

    await service.resolveIdsFromMediaItem(item);

    expect(tmdb.getDetails).not.toHaveBeenCalled();
  });
});
