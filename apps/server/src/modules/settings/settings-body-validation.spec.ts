import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { DatabaseDownloadService } from './database-download.service';
import { MediaServerSwitchService } from './media-server-switch.service';
import { MetadataSettingsService } from './metadata-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsDataService } from './settings-data.service';
import { SettingsOperationsService } from './settings-operations.service';
import { TelemetryService } from '../telemetry/telemetry.service';

/**
 * Driven over real HTTP because the bug was wiring, not schema: the bulk routes
 * took plain DTO classes, which the global nestjs-zod pipe passes through
 * untouched. A spec that called the pipe directly would have stayed green.
 */
describe('settings body validation', () => {
  let app: INestApplication;
  let baseUrl: string;

  const settingsOperationsService = {
    updateSettings: jest.fn(),
    patchSettings: jest.fn(),
    savePlexApiAuthToken: jest.fn(),
    cronIsValid: jest.fn(),
    updateTelemetrySetting: jest.fn(),
  };

  const patch = (body: unknown) =>
    fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsOperationsService,
          useValue: settingsOperationsService,
        },
        { provide: SettingsDataService, useValue: {} },
        { provide: MetadataSettingsService, useValue: {} },
        { provide: MediaServerSwitchService, useValue: {} },
        { provide: DatabaseDownloadService, useValue: {} },
        {
          // The controller consults this before storing, so the stub has to
          // answer it or every telemetry POST 500s.
          provide: TelemetryService,
          useValue: { forcedOff: () => false },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    settingsOperationsService.patchSettings.mockResolvedValue({ code: 1 });
    settingsOperationsService.updateTelemetrySetting.mockResolvedValue({
      code: 1,
    });
  });

  it.each([
    {
      case: 'a URL without an http(s) scheme',
      body: { seerr_url: 'file:///e' },
    },
    {
      // Slashes are stripped first, so this is left as the bare 'http:'.
      case: 'a URL that is nothing but a scheme',
      body: { seerr_url: 'http://' },
    },
    {
      case: 'a wrongly typed field',
      body: { download_client_fallback_ratio: 'nope' },
    },
  ])('rejects $case', async ({ body }) => {
    expect((await patch(body)).status).toBe(400);
    expect(settingsOperationsService.patchSettings).not.toHaveBeenCalled();
  });

  it('normalises trailing slashes away instead of rejecting them (#3416)', async () => {
    expect((await patch({ tautulli_url: 'http://t:8181//' })).status).toBe(200);
    expect(settingsOperationsService.patchSettings).toHaveBeenCalledWith({
      tautulli_url: 'http://t:8181',
    });
  });

  it('strips keys the client has no business setting', async () => {
    // An `id` in the body made TypeORM insert a second settings row.
    expect((await patch({ id: 999, applicationTitle: 'M' })).status).toBe(200);
    expect(settingsOperationsService.patchSettings).toHaveBeenCalledWith({
      applicationTitle: 'M',
    });
  });

  it('still accepts the partial payloads the UI sends', async () => {
    const body = { plex_hostname: 'plex.local', plex_port: 32400 };

    expect((await patch(body)).status).toBe(200);
    expect(settingsOperationsService.patchSettings).toHaveBeenCalledWith(body);
  });

  describe('telemetry toggle', () => {
    const postTelemetry = (body: unknown) =>
      fetch(`${baseUrl}/api/settings/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

    it.each([
      { case: 'a missing flag', body: {} },
      { case: 'a non-boolean flag', body: { enabled: 'yes' } },
      { case: 'a null flag', body: { enabled: null } },
    ])('rejects $case', async ({ body }) => {
      expect((await postTelemetry(body)).status).toBe(400);
      expect(
        settingsOperationsService.updateTelemetrySetting,
      ).not.toHaveBeenCalled();
    });

    it.each([true, false])('accepts enabled: %s', async (enabled) => {
      expect((await postTelemetry({ enabled })).status).toBe(201);
      expect(
        settingsOperationsService.updateTelemetrySetting,
      ).toHaveBeenCalledWith(enabled);
    });
  });

  it('keeps every field GET returns, so a read-modify-write loses nothing', async () => {
    const body = {
      jellyfin_server_name: 'living-room',
      emby_server_name: 'study',
    };

    expect((await patch(body)).status).toBe(200);
    expect(settingsOperationsService.patchSettings).toHaveBeenCalledWith(body);
  });
});
