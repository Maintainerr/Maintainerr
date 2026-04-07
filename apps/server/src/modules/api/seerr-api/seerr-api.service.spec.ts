import { Mocked, TestBed } from '@suites/unit';
import { SettingsService } from '../../settings/settings.service';
import { SeerrApiService, SeerrRequestStatus } from './seerr-api.service';

describe('SeerrApiService', () => {
  let service: SeerrApiService;
  let settings: Mocked<SettingsService>;

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(SeerrApiService).compile();

    service = unit;
    settings = unitRef.get(
      SettingsService,
    ) as unknown as Mocked<SettingsService>;
    settings.seerrConfigured.mockReturnValue(true);
  });

  it('should return false when no other requested seasons remain', async () => {
    jest.spyOn(service, 'getShow').mockResolvedValue({
      id: 1,
      mediaInfo: {
        id: 1,
        tmdbId: 100,
        tvdbId: 200,
        status: 1,
        updatedAt: '2026-03-14T00:00:00.000Z',
        mediaAddedAt: '2026-03-14T00:00:00.000Z',
        externalServiceId: 1,
        externalServiceId4k: 1,
        mediaType: 'tv',
        requests: [
          {
            id: 10,
            type: 'tv',
            status: SeerrRequestStatus.APPROVED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 1,
                name: 'Season 1',
                seasonNumber: 1,
                status: SeerrRequestStatus.APPROVED,
              },
            ],
          },
          {
            id: 11,
            type: 'tv',
            status: SeerrRequestStatus.DECLINED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 2,
                name: 'Season 2',
                seasonNumber: 2,
                status: SeerrRequestStatus.DECLINED,
              },
            ],
          },
          {
            id: 12,
            type: 'tv',
            status: SeerrRequestStatus.APPROVED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 3,
                name: 'Season 3',
                seasonNumber: 3,
                status: SeerrRequestStatus.COMPLETED,
              },
            ],
          },
        ],
      },
      firstAirDate: new Date('2020-01-01'),
    });

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      false,
    );
  });

  it('should return true when another active requested season remains', async () => {
    jest.spyOn(service, 'getShow').mockResolvedValue({
      id: 1,
      mediaInfo: {
        id: 1,
        tmdbId: 100,
        tvdbId: 200,
        status: 1,
        updatedAt: '2026-03-14T00:00:00.000Z',
        mediaAddedAt: '2026-03-14T00:00:00.000Z',
        externalServiceId: 1,
        externalServiceId4k: 1,
        mediaType: 'tv',
        requests: [
          {
            id: 10,
            type: 'tv',
            status: SeerrRequestStatus.APPROVED,
            createdAt: '2026-03-14T00:00:00.000Z',
            updatedAt: '2026-03-14T00:00:00.000Z',
            requestedBy: {} as never,
            modifiedBy: {} as never,
            is4k: false,
            serverId: 1,
            profileId: 1,
            rootFolder: '/',
            media: {} as never,
            seasons: [
              {
                id: 1,
                name: 'Season 1',
                seasonNumber: 1,
                status: SeerrRequestStatus.APPROVED,
              },
              {
                id: 2,
                name: 'Season 2',
                seasonNumber: 2,
                status: SeerrRequestStatus.APPROVED,
              },
            ],
          },
        ],
      },
      firstAirDate: new Date('2020-01-01'),
    });

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      true,
    );
  });

  it('should return undefined when Seerr is not configured', async () => {
    settings.seerrConfigured.mockReturnValue(false);

    await expect(service.hasRemainingSeasonRequests(100, 1)).resolves.toBe(
      undefined,
    );
  });
});
