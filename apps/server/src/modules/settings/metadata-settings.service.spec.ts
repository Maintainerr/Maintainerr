import { MetadataProviderPreference } from '@maintainerr/contracts';
import { createMockLogger } from '../../../test/utils/data';
import { Settings } from './entities/settings.entities';
import { MetadataSettingsService } from './metadata-settings.service';

describe('MetadataSettingsService', () => {
  const settingsRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  } as any;

  const eventEmitter = {
    emit: jest.fn(),
  } as any;

  const tmdbApi = {
    testConnection: jest.fn(),
  } as any;

  const tvdbApi = {
    testConnection: jest.fn(),
  } as any;

  let service: MetadataSettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    settingsRepo.findOne.mockResolvedValue({
      id: 1,
      tmdb_api_key: null,
      tvdb_api_key: null,
      metadata_provider_preference: MetadataProviderPreference.TMDB_PRIMARY,
    } satisfies Partial<Settings>);
    settingsRepo.save.mockImplementation(
      async (settings: Partial<Settings>) => ({
        ...settings,
      }),
    );

    service = new MetadataSettingsService(
      settingsRepo,
      eventEmitter,
      tmdbApi,
      tvdbApi,
      createMockLogger(),
    );
  });

  it('validates a TMDB key before saving it', async () => {
    tmdbApi.testConnection.mockResolvedValue({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    await expect(
      service.updateTmdbSetting({ api_key: 'tmdb-key' }),
    ).resolves.toEqual({ status: 'OK', code: 1, message: 'Success' });

    expect(tmdbApi.testConnection).toHaveBeenCalledWith('tmdb-key');
    expect(settingsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tmdb_api_key: 'tmdb-key' }),
    );
    expect(eventEmitter.emit).toHaveBeenCalled();
  });

  it('does not save an invalid TVDB key', async () => {
    tvdbApi.testConnection.mockResolvedValue({
      status: 'NOK',
      code: 0,
      message: 'Invalid API key',
    });

    await expect(
      service.updateTvdbSetting({ api_key: 'bad-key' }),
    ).resolves.toEqual({
      status: 'NOK',
      code: 0,
      message: 'Invalid API key',
    });

    expect(settingsRepo.save).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('removes a metadata key by persisting null', async () => {
    await expect(service.removeTmdbSetting()).resolves.toEqual({
      status: 'OK',
      code: 1,
      message: 'Success',
    });

    expect(settingsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tmdb_api_key: null }),
    );
  });

  it('updates metadata provider preference via settings persistence', async () => {
    await expect(
      service.updateMetadataProviderPreference(
        MetadataProviderPreference.TVDB_PRIMARY,
      ),
    ).resolves.toEqual({ status: 'OK', code: 1, message: 'Success' });

    expect(settingsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata_provider_preference: MetadataProviderPreference.TVDB_PRIMARY,
      }),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        settings: expect.objectContaining({
          metadata_provider_preference: MetadataProviderPreference.TVDB_PRIMARY,
        }),
      }),
    );
  });
});
