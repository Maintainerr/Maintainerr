import { TestBed, type Mocked } from '@suites/unit';
import { Repository } from 'typeorm';
import { Settings } from './entities/settings.entities';
import { SettingsDataService } from './settings-data.service';

describe('SettingsDataService', () => {
  let service: SettingsDataService;
  let settingsRepo: Mocked<Repository<Settings>>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SettingsDataService).compile();

    service = unit;
    settingsRepo = unitRef.get('SettingsRepository');
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
});
