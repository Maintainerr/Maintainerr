import { TestBed } from '@suites/unit';
import axios, { AxiosInstance } from 'axios';
import { TmdbApiService } from './tmdb.service';

describe('TMDB connection test', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['', 'default'],
    ['   ', 'default'],
    [undefined, 'saved-key'],
    ['submitted-key', 'submitted-key'],
  ])('selects the correct key for %j', async (key, expected) => {
    const create = jest.spyOn(axios, 'create');
    const { unit } = await TestBed.solitary(TmdbApiService).compile();
    const client: AxiosInstance = create.mock.results[0].value;
    const defaultKey = client.defaults.params.api_key;
    const get = jest
      .spyOn(client, 'get')
      .mockResolvedValue({ data: { id: 550 } });
    unit.handleSettingsUpdate({
      oldSettings: {},
      settings: { tmdb_api_key: 'saved-key' },
    });

    await expect(unit.testConnection(key)).resolves.toMatchObject({ code: 1 });
    expect(get).toHaveBeenCalledWith(
      '/movie/550',
      expect.objectContaining({
        params: { api_key: expected === 'default' ? defaultKey : expected },
      }),
    );
    expect(client.defaults.params.api_key).toBe('saved-key');
  });
});
