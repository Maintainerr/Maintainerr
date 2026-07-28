import { MaintainerrLogger } from '../../../logging/logs.service';
import { SportarrApi } from './sportarr.helper';

describe('SportarrApi', () => {
  let sportarrApi: SportarrApi;
  let logger: jest.Mocked<MaintainerrLogger>;

  beforeEach(() => {
    logger = {
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<MaintainerrLogger>;

    sportarrApi = new SportarrApi(
      { url: 'http://localhost:1867/api/', apiKey: 'test' },
      logger,
    );
  });

  // The resolver's null/undefined contract mirrors the Sonarr client: undefined
  // = the lookup itself failed (callers fail closed), null = Sportarr is
  // reachable but tracks no league with that external id.
  describe('getLeagueByExternalId', () => {
    it('returns null without calling Sportarr when the id is blank', async () => {
      const getSpy = jest.spyOn(sportarrApi as any, 'getWithoutCache');

      await expect(sportarrApi.getLeagueByExternalId('  ')).resolves.toBeNull();
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('returns undefined when the league list lookup fails transiently', async () => {
      jest
        .spyOn(sportarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);

      await expect(
        sportarrApi.getLeagueByExternalId('lg-000278'),
      ).resolves.toBeUndefined();
    });

    it('returns null when no league matches the external id', async () => {
      jest.spyOn(sportarrApi as any, 'getWithoutCache').mockResolvedValue([
        { id: 1, externalId: 'lg-000001', name: 'NFL' },
        { id: 2, externalId: 'lg-000002', name: 'NBA' },
      ]);

      await expect(
        sportarrApi.getLeagueByExternalId('lg-000278'),
      ).resolves.toBeNull();
    });

    it('skips the list fetch when a pre-fetched list is supplied', async () => {
      const detail = {
        id: 3,
        externalId: 'lg-000278',
        name: 'Formula 1',
        monitored: true,
      };
      const getSpy = jest
        .spyOn(sportarrApi as any, 'getWithoutCache')
        .mockResolvedValue(detail);

      await expect(
        sportarrApi.getLeagueByExternalId('lg-000278', [
          { id: 3, externalId: 'lg-000278', name: 'Formula 1' } as any,
        ]),
      ).resolves.toEqual(expect.objectContaining({ id: 3 }));

      // Only the detail endpoint is hit; the /leagues list is not re-pulled.
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith('/leagues/3', expect.anything());
    });

    it('resolves the matching league via its detail endpoint', async () => {
      const detail = {
        id: 3,
        externalId: 'lg-000278',
        name: 'Formula 1',
        monitored: true,
        eventCount: 1741,
        fileCount: 264,
      };
      const getSpy = jest
        .spyOn(sportarrApi as any, 'getWithoutCache')
        // 1st call: the list. 2nd call: the detail for the matched id.
        .mockResolvedValueOnce([
          { id: 3, externalId: 'lg-000278', name: 'Formula 1' },
        ])
        .mockResolvedValueOnce(detail);

      await expect(
        sportarrApi.getLeagueByExternalId('LG-000278'),
      ).resolves.toEqual(expect.objectContaining({ id: 3, monitored: true }));
      // Detail is fetched by the resolved internal id, not the external id.
      expect(getSpy).toHaveBeenNthCalledWith(
        2,
        '/leagues/3',
        expect.anything(),
      );
    });
  });

  describe('write operations', () => {
    it('deleteLeague passes deleteFiles through and returns true on success', async () => {
      const del = jest
        .spyOn((sportarrApi as any).axios, 'delete')
        .mockResolvedValue({ data: {} });

      await expect(sportarrApi.deleteLeague(3, true)).resolves.toBe(true);
      expect(del).toHaveBeenCalledWith(
        '/leagues/3',
        expect.objectContaining({ params: { deleteFiles: true } }),
      );
    });

    it('deleteLeague returns false when the request throws', async () => {
      jest
        .spyOn((sportarrApi as any).axios, 'delete')
        .mockRejectedValue(new Error('boom'));

      await expect(sportarrApi.deleteLeague(3)).resolves.toBe(false);
    });

    it('setSeasonMonitored posts the desired state to the toggle endpoint', async () => {
      const put = jest
        .spyOn((sportarrApi as any).axios, 'put')
        .mockResolvedValue({ data: {} });

      await expect(
        sportarrApi.setSeasonMonitored(3, '2026', false),
      ).resolves.toBe(true);
      expect(put).toHaveBeenCalledWith(
        '/leagues/3/seasons/2026/toggle',
        { monitored: false },
        expect.anything(),
      );
    });

    it('setLeagueMonitored puts the monitored flag on the league', async () => {
      const put = jest
        .spyOn((sportarrApi as any).axios, 'put')
        .mockResolvedValue({ data: {} });

      await expect(sportarrApi.setLeagueMonitored(3, false)).resolves.toBe(
        true,
      );
      expect(put).toHaveBeenCalledWith(
        '/leagues/3',
        { monitored: false },
        expect.anything(),
      );
    });

    it('deleteEventFiles targets the event files endpoint', async () => {
      const del = jest
        .spyOn((sportarrApi as any).axios, 'delete')
        .mockResolvedValue({ data: {} });

      await expect(sportarrApi.deleteEventFiles(999)).resolves.toBe(true);
      expect(del).toHaveBeenCalledWith('/events/999/files', expect.anything());
    });
  });

  describe('getLeagues', () => {
    it('returns undefined (not an empty list) when the fetch fails', async () => {
      jest
        .spyOn(sportarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);

      await expect(sportarrApi.getLeagues()).resolves.toBeUndefined();
    });
  });

  describe('getLeagueEvents', () => {
    it('returns the events on success', async () => {
      const events = [{ id: 10, seasonNumber: 2026, episodeNumber: 5 }];
      jest
        .spyOn(sportarrApi as any, 'getWithoutCache')
        .mockResolvedValue(events);

      await expect(sportarrApi.getLeagueEvents(3)).resolves.toEqual(events);
    });

    it('returns undefined (not an empty list) when the fetch fails', async () => {
      // An outage must stay distinguishable from "league has no events":
      // callers fail closed on undefined, while [] would make count-based
      // removal rules match everything.
      jest
        .spyOn(sportarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);

      await expect(sportarrApi.getLeagueEvents(3)).resolves.toBeUndefined();
    });
  });

  describe('getQualityProfiles', () => {
    it('returns undefined when the fetch fails', async () => {
      jest.spyOn(sportarrApi as any, 'get').mockResolvedValue(undefined);

      await expect(sportarrApi.getQualityProfiles()).resolves.toBeUndefined();
    });
  });

  describe('getLeagueDownloadHistory', () => {
    it('returns the league download history rows', async () => {
      const rows = [
        { eventId: 10, downloadId: 'hashA', protocol: 'Torrent' },
        { eventId: 11, downloadId: 'nzoB', protocol: 'Usenet' },
      ];
      jest.spyOn(sportarrApi as any, 'getWithoutCache').mockResolvedValue(rows);

      await expect(sportarrApi.getLeagueDownloadHistory(3)).resolves.toEqual(
        rows,
      );
    });

    it('returns an empty array when the request fails', async () => {
      jest
        .spyOn(sportarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);

      await expect(sportarrApi.getLeagueDownloadHistory(3)).resolves.toEqual(
        [],
      );
    });
  });
});
