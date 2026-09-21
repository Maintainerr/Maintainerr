import { Mocked, TestBed } from '@suites/unit';
import { MaintainerrLoggerFactory } from '../../logging/logs.service';
import { SettingsDataService } from '../../settings/settings-data.service';
import { TautulliApiService } from './tautulli-api.service';

describe('TautulliApiService', () => {
  let service: TautulliApiService;
  let settings: Mocked<SettingsDataService>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(TautulliApiService).compile();
    service = unit;
    settings = unitRef.get(
      SettingsDataService,
    ) as unknown as Mocked<SettingsDataService>;
    unitRef.get(MaintainerrLoggerFactory).createLogger.mockReturnValue({
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as never);
  });

  // Without the reset the app kept querying an integration the user had
  // deleted, until the next restart.
  it('drops the client when the settings are removed', () => {
    settings.tautulli_url = 'http://tautulli.local';
    settings.tautulli_api_key = 'key';
    service.init();
    expect(service.api).toBeDefined();

    settings.tautulli_url = null;
    settings.tautulli_api_key = null;
    service.init();

    expect(service.api).toBeUndefined();
  });
  describe('getItemStats', () => {
    const answer = (byCommand: Record<string, unknown>) => {
      service.api = {
        get: jest.fn(
          async (_path: string, config: { params: { cmd: string } }) => ({
            response: { result: 'success', data: byCommand[config.params.cmd] },
          }),
        ),
      } as never;
    };

    beforeEach(() => {
      settings.tautulli_url = 'http://tautulli.local';
    });

    it('totals the per-user stats and dates them from the newest show play', async () => {
      answer({
        get_item_user_stats: [
          { friendly_name: 'alice', total_plays: 3, total_time: 120 },
          { friendly_name: 'bob', total_plays: 1, total_time: 60 },
        ],
        get_metadata: { media_type: 'show', rating_key: '7' },
        get_history: { data: [{ stopped: 1767225600 }] },
      });

      await expect(service.getItemStats('7')).resolves.toEqual({
        url: 'http://tautulli.local/info?rating_key=7&source=history',
        plays: 4,
        watchTime: 180,
        lastWatched: '2026-01-01T00:00:00.000Z',
        users: [
          { name: 'alice', plays: 3, watchTime: 120, lastWatched: null },
          { name: 'bob', plays: 1, watchTime: 60, lastWatched: null },
        ],
      });
      expect(service.api.get).toHaveBeenCalledWith('', {
        params: expect.objectContaining({
          cmd: 'get_history',
          grandparent_rating_key: '7',
        }),
      });
    });

    it('answers null for an item nobody played and undefined when unreadable', async () => {
      answer({ get_item_user_stats: [] });
      await expect(service.getItemStats('7')).resolves.toBeNull();

      service.api = { get: jest.fn().mockResolvedValue(undefined) } as never;
      await expect(service.getItemStats('7')).resolves.toBeUndefined();
    });
  });
});
