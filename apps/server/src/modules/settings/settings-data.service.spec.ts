import { TestBed, type Mocked } from '@suites/unit';
import { Repository } from 'typeorm';
import { Settings } from './entities/settings.entities';
import { SettingsDataService } from './settings-data.service';

describe('SettingsDataService', () => {
  let service: SettingsDataService;
  let settingsRepo: Mocked<Repository<Settings>>;
  let repos: Record<string, Mocked<Repository<unknown>>>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SettingsDataService).compile();

    service = unit;
    settingsRepo = unitRef.get('SettingsRepository');
    repos = {
      SettingsRepository: settingsRepo as Mocked<Repository<unknown>>,
      RadarrSettingsRepository: unitRef.get('RadarrSettingsRepository'),
      SonarrSettingsRepository: unitRef.get('SonarrSettingsRepository'),
      SportarrSettingsRepository: unitRef.get('SportarrSettingsRepository'),
    };
  });

  // Null is reserved for rows the telemetry migration carried over, which are
  // the only ones the consent prompt should appear for.
  it('answers telemetry when it creates the initial settings row', async () => {
    settingsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        Object.assign(new Settings(), { id: 1, telemetryEnabled: true }),
      );

    await service.init();

    expect(settingsRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ telemetryEnabled: true }),
    );
    expect(service.telemetryEnabled).toBe(true);
  });

  it('leaves an existing row unanswered', async () => {
    settingsRepo.findOne.mockResolvedValue(
      Object.assign(new Settings(), {
        id: 1,
        media_server_type: 'plex',
        plex_auth_token: 'token',
        telemetryEnabled: null,
      }),
    );

    await service.init();

    expect(settingsRepo.insert).not.toHaveBeenCalled();
    expect(service.telemetryEnabled).toBeNull();
  });

  // A locked database rejects rather than throwing synchronously, so these
  // getters have to await inside their try for the catch to see it at all.
  it('answers a status object when the database is locked', async () => {
    const locked = () => Promise.reject(new Error('SQLITE_BUSY'));
    const getters: [string, 'find' | 'findOne', () => Promise<unknown>][] = [
      ['SettingsRepository', 'findOne', () => service.getSettings()],
      ['RadarrSettingsRepository', 'find', () => service.getRadarrSettings()],
      [
        'RadarrSettingsRepository',
        'findOne',
        () => service.getRadarrSetting(1),
      ],
      ['SonarrSettingsRepository', 'find', () => service.getSonarrSettings()],
      [
        'SonarrSettingsRepository',
        'findOne',
        () => service.getSonarrSetting(1),
      ],
      [
        'SportarrSettingsRepository',
        'find',
        () => service.getSportarrSettings(),
      ],
      [
        'SportarrSettingsRepository',
        'findOne',
        () => service.getSportarrSetting(1),
      ],
    ];

    for (const [repo, method, call] of getters) {
      repos[repo][method].mockImplementation(locked);

      await expect(call()).resolves.toEqual(
        expect.objectContaining({ status: 'NOK', code: 0 }),
      );
    }
  });
});
