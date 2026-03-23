import { MetadataProviderPreference } from '@maintainerr/contracts';
import { createMediaItem, createMockLogger } from '../../../test/utils/data';
import { IMetadataProvider } from './interfaces/metadata-provider.interface';
import { MetadataDetails, ProviderIds } from './interfaces/metadata.types';
import { MetadataService } from './metadata.service';

const createMockProvider = (
  name: string,
  available = true,
): jest.Mocked<IMetadataProvider> => {
  const key = name.toLowerCase();
  return {
    name,
    idKey: key,
    isAvailable: jest.fn().mockReturnValue(available),
    extractId: jest.fn().mockImplementation((ids: ProviderIds) => {
      const v = ids[key];
      return typeof v === 'number' ? v : undefined;
    }),
    assignId: jest.fn().mockImplementation((ids: ProviderIds, id: number) => {
      ids[key] = id;
    }),
    getDetails: jest.fn(),
    getPosterUrl: jest.fn(),
    getBackdropUrl: jest.fn(),
    getPersonDetails: jest.fn(),
    findByExternalId: jest.fn(),
  };
};

const createService = (
  preference = MetadataProviderPreference.TMDB_PRIMARY,
  providerOverrides?: jest.Mocked<IMetadataProvider>[],
) => {
  const tmdb = createMockProvider('TMDB');
  const tvdb = createMockProvider('TVDB');
  const providers = providerOverrides ?? [tmdb, tvdb];

  const mediaServerService = { getMetadata: jest.fn() };
  const logger = createMockLogger();
  const service = new MetadataService(
    providers,
    { getService: jest.fn().mockResolvedValue(mediaServerService) } as any,
    { metadata_provider_preference: preference } as any,
    logger,
  );
  service.onApplicationBootstrap();

  return { service, tmdb, tvdb, providers, mediaServerService, logger };
};

describe('MetadataService', () => {
  it('respects provider preference order', async () => {
    const { service, tmdb, tvdb } = createService(
      MetadataProviderPreference.TVDB_PRIMARY,
    );
    const details: MetadataDetails = {
      id: 200,
      title: 'Test Series',
      type: 'tv',
      externalIds: { tvdb: 200, type: 'tv' },
    };
    tvdb.getDetails.mockResolvedValue(details);

    const result = await service.getDetails({ tvdb: 200 }, 'tv');

    expect(result).toEqual(details);
    expect(tmdb.getDetails).not.toHaveBeenCalled();
  });

  it('falls back to next provider when preferred returns undefined', async () => {
    const { service, tmdb, tvdb } = createService();
    tmdb.getDetails.mockResolvedValue(undefined);
    tvdb.getDetails.mockResolvedValue({
      id: 20,
      title: 'Fallback',
      type: 'movie',
      externalIds: { tvdb: 20, type: 'movie' },
    });

    const result = await service.getDetails({ tmdb: 1, tvdb: 20 }, 'movie');

    expect(result?.title).toBe('Fallback');
    expect(tmdb.getDetails).toHaveBeenCalled();
    expect(tvdb.getDetails).toHaveBeenCalled();
  });

  it('skips unavailable providers entirely', async () => {
    const tmdb = createMockProvider('TMDB', false);
    const tvdb = createMockProvider('TVDB', true);
    const { service } = createService(MetadataProviderPreference.TMDB_PRIMARY, [
      tmdb,
      tvdb,
    ]);
    tvdb.getDetails.mockResolvedValue({
      id: 1,
      title: 'X',
      type: 'movie',
      externalIds: { tvdb: 1, type: 'movie' },
    });

    await service.getDetails({ tmdb: 1, tvdb: 1 }, 'movie');

    expect(tmdb.getDetails).not.toHaveBeenCalled();
  });

  it('updates preference at runtime via settings event', async () => {
    const { service, tvdb } = createService(
      MetadataProviderPreference.TMDB_PRIMARY,
    );
    service.handleSettingsUpdate({
      settings: {
        metadata_provider_preference: MetadataProviderPreference.TVDB_PRIMARY,
      },
    });
    tvdb.getDetails.mockResolvedValue({
      id: 1,
      title: 'X',
      type: 'tv',
      externalIds: { tvdb: 1, type: 'tv' },
    });

    await service.getDetails({ tmdb: 1, tvdb: 1 }, 'tv');

    expect(tvdb.getDetails).toHaveBeenCalledWith(1, 'tv');
  });

  it('resolves cross-provider IDs via details lookup', async () => {
    const item = createMediaItem({
      type: 'movie',
      title: 'Test Movie',
      providerIds: { tmdb: ['10'] },
    });
    const { service, tmdb } = createService();
    tmdb.getDetails.mockResolvedValue({
      id: 10,
      title: 'Test Movie',
      type: 'movie',
      externalIds: {
        tmdb: 10,
        tvdb: 20,
        imdb: 'tt0000010',
        type: 'movie',
      },
    });

    const result = await service.resolveIdsFromMediaItem(item);

    expect(result).toEqual(expect.objectContaining({ tmdb: 10, tvdb: 20 }));
  });

  it('returns poster url tagged with the serving provider', async () => {
    const { service, tmdb } = createService();
    tmdb.getPosterUrl.mockResolvedValue(
      'https://image.tmdb.org/t/p/w500/poster.jpg',
    );

    const result = await service.getPosterUrl({ tmdb: 10 }, 'movie');

    expect(result).toEqual({
      url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      provider: 'TMDB',
      id: 10,
    });
  });

  it('walks up hierarchy for episodes before resolving IDs', async () => {
    const episode = createMediaItem({
      type: 'episode',
      grandparentId: 'show-1',
      providerIds: {},
    });
    const show = createMediaItem({
      id: 'show-1',
      type: 'show',
      providerIds: { tmdb: ['30'], tvdb: ['200'] },
    });

    const { service, mediaServerService } = createService();
    mediaServerService.getMetadata
      .mockResolvedValueOnce(episode)
      .mockResolvedValueOnce(show);

    const result = await service.resolveIds('ep-1');

    expect(mediaServerService.getMetadata).toHaveBeenCalledWith('show-1');
    expect(result).toEqual(expect.objectContaining({ tmdb: 30, tvdb: 200 }));
  });

  it('walks up via parentId for seasons', async () => {
    const season = createMediaItem({
      type: 'season',
      parentId: 'show-2',
      providerIds: {},
    });
    const show = createMediaItem({
      id: 'show-2',
      type: 'show',
      providerIds: { tmdb: ['40'], tvdb: ['300'] },
    });

    const { service, mediaServerService } = createService();
    mediaServerService.getMetadata
      .mockResolvedValueOnce(season)
      .mockResolvedValueOnce(show);

    const result = await service.resolveIds('season-1');

    expect(mediaServerService.getMetadata).toHaveBeenCalledWith('show-2');
    expect(result).toEqual(expect.objectContaining({ tmdb: 40, tvdb: 300 }));
  });

  it('returns undefined when hierarchy metadata cannot be fetched', async () => {
    const episode = createMediaItem({
      type: 'episode',
      grandparentId: 'show-missing',
      providerIds: {},
    });

    const { service, mediaServerService, logger } = createService();
    mediaServerService.getMetadata
      .mockResolvedValueOnce(episode)
      .mockResolvedValueOnce(undefined);

    await expect(service.resolveIds('ep-missing')).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to fetch hierarchy metadata for media server item ep-missing via parent item show-missing',
    );
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
    tmdb.extractId.mockImplementation(() => {
      throw new Error('oops');
    });

    const item = createMediaItem({
      type: 'movie',
      providerIds: { tmdb: ['1'] },
    });
    expect(await service.resolveIdsFromMediaItem(item)).toBeUndefined();
  });

  it('getBackdropUrl returns tagged result', async () => {
    const { service, tmdb } = createService();
    tmdb.getBackdropUrl.mockResolvedValue('https://img/bg.jpg');

    const result = await service.getBackdropUrl({ tmdb: 1 }, 'movie');

    expect(result).toEqual({
      url: 'https://img/bg.jpg',
      provider: 'TMDB',
      id: 1,
    });
  });

  it('getPersonDetails delegates to provider', async () => {
    const { service, tmdb } = createService();
    tmdb.getPersonDetails.mockResolvedValue({ id: 1, name: 'Actor' } as any);

    const result = await service.getPersonDetails({ tmdb: 1 });

    expect(result).toEqual(expect.objectContaining({ name: 'Actor' }));
  });

  it('fillIdsFromExternalSearch assigns IDs from IMDB search', async () => {
    const item = createMediaItem({
      type: 'movie',
      providerIds: { imdb: ['tt0000099'] },
    });
    const { service, tmdb, tvdb } = createService();
    tmdb.getDetails.mockResolvedValue(undefined);
    tvdb.getDetails.mockResolvedValue(undefined);
    tmdb.findByExternalId.mockResolvedValue([{ movieId: 50 }]);
    tvdb.findByExternalId.mockResolvedValue([{ movieId: 60 }]);

    const result = await service.resolveIdsFromMediaItem(item);

    expect(result?.['tmdb']).toBe(50);
    expect(result?.['tvdb']).toBe(60);
  });

  it('skips external search when a usable ID is already present and no explicit keys are required', async () => {
    const item = createMediaItem({
      type: 'movie',
      providerIds: { imdb: ['tt0000099'], tmdb: ['50'] },
    });
    const { service, tmdb, tvdb } = createService();
    tmdb.getDetails.mockResolvedValue(undefined);
    tvdb.getDetails.mockResolvedValue(undefined);
    tvdb.findByExternalId.mockResolvedValue([{ movieId: 60 }]);

    const result = await service.resolveIdsFromMediaItem(item);

    expect(result?.['tmdb']).toBe(50);
    expect(result?.['tvdb']).toBeUndefined();
    expect(tmdb.findByExternalId).not.toHaveBeenCalled();
    expect(tvdb.findByExternalId).not.toHaveBeenCalled();
  });

  it('resolves missing explicit provider keys even when another usable ID already exists', async () => {
    const item = createMediaItem({
      type: 'movie',
      providerIds: { imdb: ['tt0000099'], tmdb: ['50'] },
    });
    const { service, tmdb, tvdb } = createService();
    tvdb.findByExternalId.mockResolvedValue([{ movieId: 60 }]);

    const result = await service.resolveIdsFromMediaItem(item, 'tvdb');

    expect(result?.['tmdb']).toBe(50);
    expect(result?.['tvdb']).toBe(60);
    expect(tmdb.findByExternalId).not.toHaveBeenCalled();
    expect(tvdb.findByExternalId).toHaveBeenCalled();
  });

  it('validates direct IDs when both IDs are already present', async () => {
    const item = createMediaItem({
      type: 'movie',
      providerIds: { tmdb: ['1'], tvdb: ['2'] },
    });
    const { service, tmdb } = createService();
    tmdb.getDetails.mockResolvedValue({
      id: 1,
      title: item.title,
      type: 'movie',
      externalIds: { tmdb: 1, tvdb: 2, type: 'movie' },
    });

    await service.resolveIdsFromMediaItem(item);

    expect(tmdb.getDetails).toHaveBeenCalledWith(1, 'movie');
  });

  it('does not treat IDs from unavailable providers as resolved by default', async () => {
    const item = createMediaItem({
      type: 'show',
      providerIds: { tvdb: ['2'] },
    });
    const tmdb = createMockProvider('TMDB', true);
    const tvdb = createMockProvider('TVDB', false);
    const { service } = createService(MetadataProviderPreference.TVDB_PRIMARY, [
      tmdb,
      tvdb,
    ]);

    await expect(
      service.resolveIdsFromMediaItem(item),
    ).resolves.toBeUndefined();
  });

  it('returns partial IDs when no explicit provider keys are required', async () => {
    const item = createMediaItem({
      type: 'movie',
      providerIds: { imdb: ['tt0000099'] },
    });
    const { service, tmdb, tvdb } = createService();
    tmdb.findByExternalId.mockResolvedValue([{ movieId: 50 }]);
    tvdb.findByExternalId.mockResolvedValue([]);

    const result = await service.resolveIdsFromMediaItem(item);

    expect(result).toEqual(expect.objectContaining({ tmdb: 50 }));
  });

  it('returns undefined when explicit provider keys cannot be satisfied', async () => {
    const item = createMediaItem({
      type: 'movie',
      providerIds: { imdb: ['tt0000099'] },
    });
    const { service, tmdb, tvdb } = createService();
    tmdb.findByExternalId.mockResolvedValue([{ movieId: 50 }]);
    tvdb.findByExternalId.mockResolvedValue([]);

    await expect(
      service.resolveIdsFromMediaItem(item, 'tvdb'),
    ).resolves.toBeUndefined();
  });

  it('skips resolved IDs when provider title does not match media server title', async () => {
    const item = createMediaItem({
      type: 'movie',
      title: 'Inception',
      providerIds: { tmdb: ['99999'] },
    });
    const { service, tmdb } = createService();
    tmdb.getDetails.mockResolvedValue({
      id: 99999,
      title: 'The Room',
      type: 'movie',
      externalIds: { tmdb: 99999, tvdb: 555, type: 'movie' },
    });

    const result = await service.resolveIdsFromMediaItem(item);

    expect(result).toBeUndefined();
  });

  it('rejects mismatched direct provider IDs even when the required key is already present', async () => {
    const item = createMediaItem({
      type: 'movie',
      title: 'Inception',
      providerIds: { tmdb: ['99999'] },
    });
    const { service, tmdb } = createService();
    tmdb.getDetails.mockResolvedValue({
      id: 99999,
      title: 'The Room',
      type: 'movie',
      externalIds: { tmdb: 99999, type: 'movie' },
    });

    await expect(
      service.resolveIdsFromMediaItem(item, 'tmdb'),
    ).resolves.toBeUndefined();
  });

  it('proceeds normally when provider title matches media server title', async () => {
    const item = createMediaItem({
      type: 'movie',
      title: 'Inception',
      providerIds: { tmdb: ['27205'] },
    });
    const { service, tmdb } = createService();
    tmdb.getDetails.mockResolvedValue({
      id: 27205,
      title: 'Inception',
      type: 'movie',
      externalIds: { tmdb: 27205, tvdb: 12345, type: 'movie' },
    });

    const result = await service.resolveIdsFromMediaItem(item, 'tvdb');

    expect(result?.['tvdb']).toBe(12345);
  });

  it('getDetails cross-fixes bad IDs when fallback succeeds', async () => {
    const { service, tmdb, tvdb } = createService(
      MetadataProviderPreference.TVDB_PRIMARY,
    );
    tvdb.getDetails.mockResolvedValue(undefined);
    tmdb.getDetails.mockResolvedValue({
      id: 10,
      title: 'Test',
      type: 'tv',
      externalIds: { tmdb: 10, tvdb: 200, type: 'tv' },
    });

    const ids: ProviderIds = { tmdb: 10, tvdb: 999 };
    const result = await service.getDetails(ids, 'tv');

    expect(result?.title).toBe('Test');
    expect(ids['tvdb']).toBe(200);
  });

  it('getDetails does not alter IDs when primary provider succeeds', async () => {
    const { service, tmdb, tvdb } = createService(
      MetadataProviderPreference.TVDB_PRIMARY,
    );
    tvdb.getDetails.mockResolvedValue({
      id: 200,
      title: 'Test',
      type: 'tv',
      externalIds: { tmdb: 10, tvdb: 200, type: 'tv' },
    });

    const ids: ProviderIds = { tmdb: 10, tvdb: 200 };
    await service.getDetails(ids, 'tv');

    expect(ids['tmdb']).toBe(10);
    expect(ids['tvdb']).toBe(200);
    expect(tmdb.getDetails).not.toHaveBeenCalled();
  });

  it('image lookup cross-fixes wrong ID before fetching image', async () => {
    const { service, tmdb, tvdb } = createService(
      MetadataProviderPreference.TVDB_PRIMARY,
    );

    tvdb.getDetails.mockResolvedValue(undefined);
    tmdb.getDetails.mockResolvedValue({
      id: 10,
      title: 'Test',
      type: 'tv',
      externalIds: { tmdb: 10, tvdb: 200, type: 'tv' },
    });

    tvdb.getBackdropUrl.mockImplementation(async (id: number) =>
      id === 200 ? 'https://tvdb/correct-backdrop.jpg' : undefined,
    );

    const ids: ProviderIds = { tmdb: 10, tvdb: 999 };
    const result = await service.getBackdropUrl(ids, 'tv');

    expect(ids['tvdb']).toBe(200);
    expect(result).toEqual({
      url: 'https://tvdb/correct-backdrop.jpg',
      provider: 'TVDB',
      id: 200,
    });
  });

  it('image lookup fills missing IDs from getDetails externalIds', async () => {
    const { service, tmdb } = createService();
    tmdb.getDetails.mockResolvedValue({
      id: 10,
      title: 'Test',
      type: 'movie',
      externalIds: { tmdb: 10, tvdb: 20, type: 'movie' },
    });
    tmdb.getPosterUrl.mockResolvedValue('https://tmdb/poster.jpg');

    const ids: ProviderIds = { tmdb: 10 };
    await service.getPosterUrl(ids, 'movie');

    expect(ids['tvdb']).toBe(20);
  });
});
