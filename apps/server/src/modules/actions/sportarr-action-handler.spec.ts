import { Mocked, TestBed } from '@suites/unit';
import { MediaItemType } from '@maintainerr/contracts';
import {
  createCollection,
  createCollectionMediaWithMetadata,
  createMediaItem,
} from '../../../test/utils/data';
import { DownloadClientApiService } from '../api/download-client-api/download-client-api.service';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { IMediaServerService } from '../api/media-server/media-server.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { SettingsDataService } from '../settings/settings-data.service';
import { SportarrActionHandler } from './sportarr-action-handler';

const F1_ALIAS = 900000278;
const F1_EXTERNAL_ID = 'lg-000278';

const league = {
  id: 3,
  externalId: F1_EXTERNAL_ID,
  name: 'Formula 1',
  monitored: true,
  added: '2025-12-04T02:29:15.000Z',
};

describe('SportarrActionHandler', () => {
  let handler: SportarrActionHandler;
  let servarrService: Mocked<ServarrService>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let settings: Mocked<SettingsDataService>;
  let downloadClient: Mocked<DownloadClientApiService>;
  let mockClient: {
    getLeagueByExternalId: jest.Mock;
    getLeagueEvents: jest.Mock;
    getLeagueDownloadHistory: jest.Mock;
    deleteLeague: jest.Mock;
    deleteEventFiles: jest.Mock;
    setLeagueMonitored: jest.Mock;
    setEventMonitored: jest.Mock;
    setSeasonMonitored: jest.Mock;
    setLeagueQualityProfile: jest.Mock;
  };
  let mockMediaServer: { getMetadata: jest.Mock };

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      SportarrActionHandler,
    ).compile();
    handler = unit;
    servarrService = unitRef.get(ServarrService);
    mediaServerFactory = unitRef.get(MediaServerFactory);
    settings = unitRef.get(SettingsDataService);
    downloadClient = unitRef.get(DownloadClientApiService);

    mockClient = {
      getLeagueByExternalId: jest.fn().mockResolvedValue(league),
      getLeagueEvents: jest.fn().mockResolvedValue([]),
      getLeagueDownloadHistory: jest.fn().mockResolvedValue([]),
      deleteLeague: jest.fn().mockResolvedValue(true),
      deleteEventFiles: jest.fn().mockResolvedValue(true),
      setLeagueMonitored: jest.fn().mockResolvedValue(true),
      setEventMonitored: jest.fn().mockResolvedValue(true),
      setSeasonMonitored: jest.fn().mockResolvedValue(true),
      setLeagueQualityProfile: jest.fn().mockResolvedValue(true),
    };
    servarrService.getSportarrApiClient.mockResolvedValue(mockClient as any);

    // Cleanup off by default so the non-cleanup tests are unaffected.
    settings.downloadClientConfigured.mockReturnValue(false);

    mockMediaServer = { getMetadata: jest.fn() };
    mediaServerFactory.getService.mockResolvedValue(
      mockMediaServer as unknown as IMediaServerService,
    );
  });

  const showCollectionMedia = (arrAction = ServarrAction.DELETE) => {
    const collection = createCollection({
      arrAction,
      type: 'show' as MediaItemType,
      sportarrSettingsId: 1,
    });
    return {
      collection,
      media: createCollectionMediaWithMetadata(collection, {
        tvdbId: F1_ALIAS,
      }),
    };
  };

  it('deletes the whole league for a show-scope DELETE', async () => {
    const { collection, media } = showCollectionMedia(ServarrAction.DELETE);

    await expect(handler.handleAction(collection, media)).resolves.toBe(true);
    expect(mockClient.deleteLeague).toHaveBeenCalledWith(3, true);
  });

  it('unmonitors the league for a show-scope UNMONITOR', async () => {
    const { collection, media } = showCollectionMedia(ServarrAction.UNMONITOR);

    await expect(handler.handleAction(collection, media)).resolves.toBe(true);
    expect(mockClient.setLeagueMonitored).toHaveBeenCalledWith(3, false);
    expect(mockClient.deleteLeague).not.toHaveBeenCalled();
  });

  it('resolves a show from its own provider ids without walking to its parent', async () => {
    // On Jellyfin/Emby a show's parentId is the id-less library folder, so
    // walking up from a show resolves nothing (the #3065 trap). A show must
    // read its providerIds directly; only season/episode items walk up.
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show' as MediaItemType,
      sportarrSettingsId: 1,
    });
    const media = createCollectionMediaWithMetadata(collection, {
      tvdbId: undefined,
    });
    mockMediaServer.getMetadata.mockResolvedValue(
      createMediaItem({
        type: 'show',
        parentId: 'library-folder',
        providerIds: { tvdb: [String(F1_ALIAS)] },
      }),
    );

    await expect(handler.handleAction(collection, media)).resolves.toBe(true);
    expect(mockClient.deleteLeague).toHaveBeenCalledWith(3, true);
    expect(mockMediaServer.getMetadata).toHaveBeenCalledTimes(1);
    expect(mockMediaServer.getMetadata).not.toHaveBeenCalledWith(
      'library-folder',
    );
  });

  it('resolves an index-less event by its air date', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'episode' as MediaItemType,
      sportarrSettingsId: 1,
    });
    const media = createCollectionMediaWithMetadata(collection, {
      tvdbId: F1_ALIAS,
    });
    // Some servers expose sports events without episode numbering; the date
    // is the only handle left.
    mockMediaServer.getMetadata.mockResolvedValue(
      createMediaItem({
        type: 'episode',
        grandparentId: 'show-1',
        index: undefined,
        parentIndex: undefined,
        originallyAvailableAt: new Date('2026-07-12T00:00:00.000Z'),
      }),
    );
    mockClient.getLeagueEvents.mockResolvedValue([
      {
        id: 30,
        seasonNumber: 2026,
        episodeNumber: 12,
        title: 'British Grand Prix',
        eventDate: '2026-07-12T15:00:00.000Z',
        hasFile: true,
      },
      {
        id: 31,
        seasonNumber: 2026,
        episodeNumber: 13,
        title: 'Hungarian Grand Prix',
        eventDate: '2026-07-26T14:00:00.000Z',
        hasFile: true,
      },
    ]);

    await expect(handler.handleAction(collection, media)).resolves.toBe(true);
    expect(mockClient.setEventMonitored).toHaveBeenCalledWith(30, false);
    expect(mockClient.deleteEventFiles).toHaveBeenCalledWith(30);
    expect(mockClient.deleteEventFiles).not.toHaveBeenCalledWith(31);
  });

  it('fails closed when the air date matches more than one event', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'episode' as MediaItemType,
      sportarrSettingsId: 1,
    });
    const media = createCollectionMediaWithMetadata(collection, {
      tvdbId: F1_ALIAS,
    });
    mockMediaServer.getMetadata.mockResolvedValue(
      createMediaItem({
        type: 'episode',
        grandparentId: 'show-1',
        index: undefined,
        parentIndex: undefined,
        originallyAvailableAt: new Date('2026-07-12T00:00:00.000Z'),
      }),
    );
    // A doubleheader: two events on the same day cannot be told apart by
    // date alone, so nothing may be deleted.
    mockClient.getLeagueEvents.mockResolvedValue([
      {
        id: 30,
        seasonNumber: 2026,
        episodeNumber: 12,
        title: 'Game 1',
        eventDate: '2026-07-12T15:00:00.000Z',
        hasFile: true,
      },
      {
        id: 31,
        seasonNumber: 2026,
        episodeNumber: 13,
        title: 'Game 2',
        eventDate: '2026-07-12T20:00:00.000Z',
        hasFile: true,
      },
    ]);

    await expect(handler.handleAction(collection, media)).resolves.toBe(false);
    expect(mockClient.deleteEventFiles).not.toHaveBeenCalled();
    expect(mockClient.setEventMonitored).not.toHaveBeenCalled();
  });

  it('does nothing and reports failure when the id cannot be resolved', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'show' as MediaItemType,
      sportarrSettingsId: 1,
    });
    const media = createCollectionMediaWithMetadata(collection, {
      tvdbId: 342040, // a real TVDB id, outside the Sportarr alias range
    });

    await expect(handler.handleAction(collection, media)).resolves.toBe(false);
    expect(mockClient.getLeagueByExternalId).not.toHaveBeenCalled();
    expect(mockClient.deleteLeague).not.toHaveBeenCalled();
  });

  it('fails closed when the league lookup errors transiently', async () => {
    const { collection, media } = showCollectionMedia();
    mockClient.getLeagueByExternalId.mockResolvedValue(undefined);

    await expect(handler.handleAction(collection, media)).resolves.toBe(false);
    expect(mockClient.deleteLeague).not.toHaveBeenCalled();
  });

  it('takes no action when the league is not tracked', async () => {
    const { collection, media } = showCollectionMedia();
    mockClient.getLeagueByExternalId.mockResolvedValue(null);

    await expect(handler.handleAction(collection, media)).resolves.toBe(false);
    expect(mockClient.deleteLeague).not.toHaveBeenCalled();
  });

  it('deletes only the resolved event file for an episode-scope DELETE', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'episode' as MediaItemType,
      sportarrSettingsId: 1,
    });
    const media = createCollectionMediaWithMetadata(collection, {
      tvdbId: F1_ALIAS,
    });
    // The handler fetches the episode metadata from the media server to read
    // its season (parentIndex) and event index.
    mockMediaServer.getMetadata.mockResolvedValue(
      createMediaItem({
        type: 'episode',
        grandparentId: 'show-1',
        parentIndex: 2026,
        index: 5,
      }),
    );
    mockClient.getLeagueEvents.mockResolvedValue([
      {
        id: 10,
        seasonNumber: 2026,
        episodeNumber: 5,
        title: 'Race',
        hasFile: true,
      },
      {
        id: 11,
        seasonNumber: 2026,
        episodeNumber: 6,
        title: 'Race 2',
        hasFile: true,
      },
    ]);

    await expect(handler.handleAction(collection, media)).resolves.toBe(true);
    expect(mockClient.deleteEventFiles).toHaveBeenCalledWith(10);
    expect(mockClient.deleteEventFiles).not.toHaveBeenCalledWith(11);
    expect(mockClient.deleteLeague).not.toHaveBeenCalled();
  });

  it('rejects an unsupported action without acting', async () => {
    const { collection, media } = showCollectionMedia(
      ServarrAction.UNMONITOR_DELETE_ALL,
    );

    await expect(handler.handleAction(collection, media)).resolves.toBe(false);
    expect(mockClient.deleteLeague).not.toHaveBeenCalled();
    expect(mockClient.setLeagueMonitored).not.toHaveBeenCalled();
  });

  it('unmonitors the event before deleting its file and leaves the file when the unmonitor fails', async () => {
    const collection = createCollection({
      arrAction: ServarrAction.DELETE,
      type: 'episode' as MediaItemType,
      sportarrSettingsId: 1,
    });
    const media = createCollectionMediaWithMetadata(collection, {
      tvdbId: F1_ALIAS,
    });
    mockMediaServer.getMetadata.mockResolvedValue(
      createMediaItem({
        type: 'episode',
        grandparentId: 'show-1',
        parentIndex: 2026,
        index: 5,
      }),
    );
    mockClient.getLeagueEvents.mockResolvedValue([
      {
        id: 10,
        seasonNumber: 2026,
        episodeNumber: 5,
        title: 'Race',
        hasFile: true,
      },
    ]);
    // Deleting a still-monitored event's file would just trigger a
    // re-download, so an unconfirmed unmonitor must abort the delete.
    mockClient.setEventMonitored.mockResolvedValue(false);

    await expect(handler.handleAction(collection, media)).resolves.toBe(false);
    expect(mockClient.deleteEventFiles).not.toHaveBeenCalled();
  });

  describe('season scope', () => {
    const seasonCollectionMedia = (arrAction = ServarrAction.DELETE) => {
      const collection = createCollection({
        arrAction,
        type: 'season' as MediaItemType,
        sportarrSettingsId: 1,
      });
      return {
        collection,
        media: createCollectionMediaWithMetadata(collection, {
          tvdbId: F1_ALIAS,
        }),
      };
    };

    // A cross-year season: the media server exposes index 3, while Sportarr's
    // season label is the string "2025-2026". Matching must key on
    // seasonNumber and derive the label for the toggle endpoint.
    const crossYearEvents = [
      {
        id: 20,
        seasonNumber: 3,
        season: '2025-2026',
        episodeNumber: 1,
        title: 'Matchday 1',
        hasFile: true,
      },
      {
        id: 21,
        seasonNumber: 3,
        season: '2025-2026',
        episodeNumber: 2,
        title: 'Matchday 2',
        hasFile: false,
      },
      {
        id: 22,
        seasonNumber: 4,
        season: '2026-2027',
        episodeNumber: 1,
        title: 'Matchday 1',
        hasFile: true,
      },
    ];

    beforeEach(() => {
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'season',
          parentId: 'show-1',
          index: 3,
        }),
      );
      mockClient.getLeagueEvents.mockResolvedValue(crossYearEvents);
    });

    it('matches events by seasonNumber and unmonitors via the derived label before deleting', async () => {
      const { collection, media } = seasonCollectionMedia();
      const callOrder: string[] = [];
      mockClient.setSeasonMonitored.mockImplementation(async () => {
        callOrder.push('unmonitor');
        return true;
      });
      mockClient.deleteEventFiles.mockImplementation(async () => {
        callOrder.push('delete');
        return true;
      });

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);

      expect(mockClient.setSeasonMonitored).toHaveBeenCalledWith(
        3,
        '2025-2026',
        false,
      );
      // Only the matched season's filed event is deleted; the unmonitor
      // happens first.
      expect(mockClient.deleteEventFiles).toHaveBeenCalledTimes(1);
      expect(mockClient.deleteEventFiles).toHaveBeenCalledWith(20);
      expect(callOrder).toEqual(['unmonitor', 'delete']);
    });

    it('fails closed without deleting when the events fetch fails', async () => {
      const { collection, media } = seasonCollectionMedia();
      mockClient.getLeagueEvents.mockResolvedValue(undefined);

      await expect(handler.handleAction(collection, media)).resolves.toBe(
        false,
      );
      expect(mockClient.setSeasonMonitored).not.toHaveBeenCalled();
      expect(mockClient.deleteEventFiles).not.toHaveBeenCalled();
    });

    it('leaves the files in place when the season unmonitor fails', async () => {
      const { collection, media } = seasonCollectionMedia();
      mockClient.setSeasonMonitored.mockResolvedValue(false);

      await expect(handler.handleAction(collection, media)).resolves.toBe(
        false,
      );
      expect(mockClient.deleteEventFiles).not.toHaveBeenCalled();
    });

    it('reports failure and skips download cleanup when a file delete fails', async () => {
      const { collection, media } = seasonCollectionMedia();
      settings.downloadClientConfigured.mockReturnValue(true);
      mockClient.getLeagueDownloadHistory.mockResolvedValue([
        { eventId: 20, downloadId: 'hashA', protocol: 'Torrent' },
      ]);
      mockClient.deleteEventFiles.mockResolvedValue(false);

      await expect(handler.handleAction(collection, media)).resolves.toBe(
        false,
      );
      expect(downloadClient.removeDownloads).not.toHaveBeenCalled();
    });

    it('succeeds without any calls when Sportarr has no events for the season', async () => {
      const { collection, media } = seasonCollectionMedia();
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'season',
          parentId: 'show-1',
          index: 99,
        }),
      );

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);
      expect(mockClient.setSeasonMonitored).not.toHaveBeenCalled();
      expect(mockClient.deleteEventFiles).not.toHaveBeenCalled();
    });

    it('unmonitors via the derived label for a season-scope UNMONITOR', async () => {
      const { collection, media } = seasonCollectionMedia(
        ServarrAction.UNMONITOR,
      );

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);
      expect(mockClient.setSeasonMonitored).toHaveBeenCalledWith(
        3,
        '2025-2026',
        false,
      );
      expect(mockClient.deleteEventFiles).not.toHaveBeenCalled();
    });
  });

  describe('CHANGE_QUALITY_PROFILE', () => {
    it('refuses the action for season and episode collections', async () => {
      // The profile lives on the league; applying it from a season item would
      // change every other season the user kept.
      const collection = createCollection({
        arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
        type: 'season' as MediaItemType,
        sportarrSettingsId: 1,
        sportarrQualityProfileId: 7,
      });
      const media = createCollectionMediaWithMetadata(collection, {
        tvdbId: F1_ALIAS,
      });
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({ type: 'season', parentId: 'show-1', index: 3 }),
      );

      await expect(handler.handleAction(collection, media)).resolves.toBe(
        false,
      );
      expect(mockClient.setLeagueQualityProfile).not.toHaveBeenCalled();
    });

    it('rejects an invalid target profile id', async () => {
      const collection = createCollection({
        arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
        type: 'show' as MediaItemType,
        sportarrSettingsId: 1,
        sportarrQualityProfileId: 0,
      });
      const media = createCollectionMediaWithMetadata(collection, {
        tvdbId: F1_ALIAS,
      });

      await expect(handler.handleAction(collection, media)).resolves.toBe(
        false,
      );
      expect(mockClient.setLeagueQualityProfile).not.toHaveBeenCalled();
    });

    it('short-circuits without a write when the profile already matches', async () => {
      const collection = createCollection({
        arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
        type: 'show' as MediaItemType,
        sportarrSettingsId: 1,
        sportarrQualityProfileId: 7,
      });
      const media = createCollectionMediaWithMetadata(collection, {
        tvdbId: F1_ALIAS,
      });
      mockClient.getLeagueByExternalId.mockResolvedValue({
        ...league,
        qualityProfileId: 7,
      });

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);
      expect(mockClient.setLeagueQualityProfile).not.toHaveBeenCalled();
    });

    it('applies the profile change at show scope', async () => {
      const collection = createCollection({
        arrAction: ServarrAction.CHANGE_QUALITY_PROFILE,
        type: 'show' as MediaItemType,
        sportarrSettingsId: 1,
        sportarrQualityProfileId: 7,
      });
      const media = createCollectionMediaWithMetadata(collection, {
        tvdbId: F1_ALIAS,
      });

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);
      expect(mockClient.setLeagueQualityProfile).toHaveBeenCalledWith(3, 7);
    });
  });

  describe('download-client cleanup', () => {
    it('does not touch the download client when cleanup is off', async () => {
      const { collection, media } = showCollectionMedia(ServarrAction.DELETE);
      settings.downloadClientConfigured.mockReturnValue(false);

      await handler.handleAction(collection, media);

      expect(mockClient.getLeagueDownloadHistory).not.toHaveBeenCalled();
      expect(downloadClient.removeDownloads).not.toHaveBeenCalled();
    });

    it('removes every download the league produced on a show delete', async () => {
      const { collection, media } = showCollectionMedia(ServarrAction.DELETE);
      settings.downloadClientConfigured.mockReturnValue(true);
      mockClient.getLeagueDownloadHistory.mockResolvedValue([
        { eventId: 10, downloadId: 'hashA', protocol: 'Torrent' },
        { eventId: 11, downloadId: 'hashB', protocol: 'Torrent' },
        { eventId: 12, downloadId: null, protocol: 'Torrent' }, // no id -> skipped
      ]);

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);

      expect(downloadClient.removeDownloads).toHaveBeenCalledTimes(1);
      // Ids are normalized to lowercase for grouping before removal.
      const removed = downloadClient.removeDownloads.mock.calls[0][0].sort();
      expect(removed).toEqual(['hasha', 'hashb']);
    });

    it('groups history rows case-insensitively so a split casing cannot remove a pack backing kept events', async () => {
      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        type: 'episode' as MediaItemType,
        sportarrSettingsId: 1,
      });
      const media = createCollectionMediaWithMetadata(collection, {
        tvdbId: F1_ALIAS,
      });
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'episode',
          grandparentId: 'show-1',
          parentIndex: 2026,
          index: 5,
        }),
      );
      mockClient.getLeagueEvents.mockResolvedValue([
        {
          id: 10,
          seasonNumber: 2026,
          episodeNumber: 5,
          title: 'Race',
          hasFile: true,
        },
      ]);
      settings.downloadClientConfigured.mockReturnValue(true);
      // The same pack appears uppercased on the grab row (event 10) and
      // lowercased on the import row (event 11, kept): grouped together it
      // must stay. ABCDEF backs only the deleted event via both casings.
      mockClient.getLeagueDownloadHistory.mockResolvedValue([
        { eventId: 10, downloadId: 'ABCDEF', protocol: 'Torrent' },
        { eventId: 10, downloadId: 'abcdef', protocol: 'Torrent' },
        { eventId: 10, downloadId: 'PACK', protocol: 'Torrent' },
        { eventId: 11, downloadId: 'pack', protocol: 'Torrent' },
      ]);

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);

      expect(downloadClient.removeDownloads).toHaveBeenCalledWith(['abcdef']);
    });

    it('keeps a pack that also backs a kept event on an episode delete', async () => {
      const collection = createCollection({
        arrAction: ServarrAction.DELETE,
        type: 'episode' as MediaItemType,
        sportarrSettingsId: 1,
      });
      const media = createCollectionMediaWithMetadata(collection, {
        tvdbId: F1_ALIAS,
      });
      mockMediaServer.getMetadata.mockResolvedValue(
        createMediaItem({
          type: 'episode',
          grandparentId: 'show-1',
          parentIndex: 2026,
          index: 5,
        }),
      );
      mockClient.getLeagueEvents.mockResolvedValue([
        {
          id: 10,
          seasonNumber: 2026,
          episodeNumber: 5,
          title: 'Race',
          hasFile: true,
        },
      ]);
      settings.downloadClientConfigured.mockReturnValue(true);
      // singleTorrent backs only event 10 (deleted) -> removable.
      // packTorrent also backs event 11 (kept) -> must stay.
      mockClient.getLeagueDownloadHistory.mockResolvedValue([
        { eventId: 10, downloadId: 'singleTorrent', protocol: 'Torrent' },
        { eventId: 10, downloadId: 'packTorrent', protocol: 'Torrent' },
        { eventId: 11, downloadId: 'packTorrent', protocol: 'Torrent' },
      ]);

      await expect(handler.handleAction(collection, media)).resolves.toBe(true);

      expect(downloadClient.removeDownloads).toHaveBeenCalledWith([
        'singletorrent',
      ]);
    });
  });
});
