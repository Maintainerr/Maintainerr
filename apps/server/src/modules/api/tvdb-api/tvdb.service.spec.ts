import { Mocked, TestBed } from '@suites/unit';
import { AxiosError, AxiosHeaders } from 'axios';
import { SettingsDataService } from '../../settings/settings-data.service';
import { retryingHttp } from '../lib/httpRetry';
import { TvdbApiService } from './tvdb.service';

describe('TVDB connection test', () => {
  let service: TvdbApiService;
  let settings: Mocked<SettingsDataService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(TvdbApiService).compile();
    service = unit;
    settings = unitRef.get(SettingsDataService);
    jest.spyOn(retryingHttp, 'post').mockResolvedValue({
      data: { status: 'success', data: { token: 'test-token' } },
    });
    jest.spyOn(retryingHttp, 'get').mockResolvedValue({
      data: { status: 'success', data: { id: 121361 } },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads metadata with the submitted key without changing runtime authentication', async () => {
    settings.tvdb_api_key = 'saved-key';

    await expect(
      service.testConnection('submitted-key'),
    ).resolves.toMatchObject({
      code: 1,
    });
    expect(retryingHttp.post).toHaveBeenCalledWith(
      expect.stringContaining('/login'),
      { apikey: 'submitted-key' },
      expect.any(Object),
    );
    expect(retryingHttp.get).toHaveBeenCalledWith(
      expect.stringContaining('/series/121361/extended'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
    expect(service.isAvailable()).toBe(false);
  });

  it('rejects a login token that cannot read protected metadata', async () => {
    const error = new AxiosError('Unauthorized');
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      data: {},
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    jest.mocked(retryingHttp.get).mockRejectedValue(error);

    await expect(service.testConnection('inactive-key')).resolves.toMatchObject(
      {
        code: 0,
        message: 'Invalid API key',
      },
    );
  });

  it.each([
    { status: 'success', data: {} },
    { status: 'failure', data: { id: 121361 } },
  ])('rejects an unexpected metadata response: %j', async (data) => {
    jest.mocked(retryingHttp.get).mockResolvedValue({ data });
    await expect(service.testConnection('test-key')).resolves.toMatchObject({
      code: 0,
    });
  });

  it.each(['', '   '])(
    'rejects an empty key without using the saved key: %j',
    async (key) => {
      settings.tvdb_api_key = 'saved-key';
      await expect(service.testConnection(key)).resolves.toMatchObject({
        code: 0,
      });
      expect(retryingHttp.post).not.toHaveBeenCalled();
    },
  );
});
