import { Mocked, TestBed } from '@suites/unit';
import {
  createMediaItem,
  createRuleGroupDto,
} from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { SportarrGetterService } from './sportarr-getter.service';

// The F1 league from the docs: external id lg-000278, so the Plex item carries
// the tvdb alias 900000278.
const F1_ALIAS = '900000278';
const F1_EXTERNAL_ID = 'lg-000278';

describe('SportarrGetterService', () => {
  let service: SportarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mockClient: {
    getLeagues: jest.Mock;
    getLeagueByExternalId: jest.Mock;
    getLeagueEvents: jest.Mock;
    getQualityProfiles: jest.Mock;
  };
  let mockMediaServer: { getMetadata: jest.Mock };

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      SportarrGetterService,
    ).compile();
    service = unit;
    servarrService = unitRef.get(ServarrService);
    mediaServerFactory = unitRef.get(MediaServerFactory);

    mockClient = {
      // The resolver reads the memoized /leagues list before matching, so a
      // non-failing list is part of the default fixture.
      getLeagues: jest
        .fn()
        .mockResolvedValue([
          { id: 3, externalId: F1_EXTERNAL_ID, name: 'Formula 1' },
        ]),
      getLeagueByExternalId: jest.fn(),
      getLeagueEvents: jest.fn(),
      getQualityProfiles: jest.fn(),
    };
    servarrService.getSportarrApiClient.mockResolvedValue(mockClient as any);

    mockMediaServer = { getMetadata: jest.fn() };
    mediaServerFactory.getService.mockResolvedValue(
      mockMediaServer as unknown as IMediaServerService,
    );
  });

  const showItem = (overrides = {}) =>
    createMediaItem({
      type: 'show',
      title: 'Formula 1',
      providerIds: { tvdb: [F1_ALIAS] },
      ...overrides,
    });

  const ruleGroup = () =>
    createRuleGroupDto({
      dataType: 'show',
      collection: { title: 'F1', sportarrSettingsId: 1 } as any,
    });

  it('errors and returns null when no Sportarr server is configured', async () => {
    const result = await service.get(
      0,
      showItem(),
      'show',
      createRuleGroupDto({ collection: {} as any }),
    );
    expect(result).toBeNull();
  });

  it('fails closed (undefined) when the show metadata read fails', async () => {
    // The alias is unknown rather than absent, so it must not read as
    // definitive absence (same reasoning as the Sonarr getter, #3307).
    mockMediaServer.getMetadata.mockResolvedValue(undefined);

    const result = await service.get(
      0,
      createMediaItem({ type: 'show', providerIds: { tvdb: ['342040'] } }),
      'show',
      ruleGroup(),
    );

    expect(result).toBeUndefined();
    expect(mockClient.getLeagueByExternalId).not.toHaveBeenCalled();
  });

  // An ordinary show in a sports library carries no alias, but a definitive
  // answer would let it match NOT_EXISTS rules - so it stays transient and only
  // the log level changes.
  it('stays transient when the show reads fine but carries no league alias', async () => {
    mockMediaServer.getMetadata.mockResolvedValue(
      createMediaItem({ type: 'show', providerIds: { tvdb: ['342040'] } }),
    );

    const result = await service.get(
      0,
      createMediaItem({ type: 'show', providerIds: { tvdb: ['342040'] } }),
      'show',
      ruleGroup(),
    );

    expect(result).toBeUndefined();
    expect(mockClient.getLeagueByExternalId).not.toHaveBeenCalled();
  });

  it('finds the alias when it is not the first tvdb provider id', async () => {
    mockClient.getLeagueByExternalId.mockResolvedValue({
      id: 3,
      externalId: F1_EXTERNAL_ID,
      name: 'Formula 1',
      monitored: true,
      added: '2025-12-04T02:29:15.000Z',
    });

    // A show refreshed since the agents stamp their own namespace carries the
    // native id; it wins over the alias.
    const nativeResult = await service.get(
      1,
      showItem({
        providerIds: { sportarr: [F1_EXTERNAL_ID], tvdb: ['900000999'] },
      }),
      'show',
      ruleGroup(),
    );

    expect(nativeResult).toBe(true);
    expect(mockClient.getLeagueByExternalId).toHaveBeenCalledWith(
      F1_EXTERNAL_ID,
      expect.any(Array),
    );

    // An agent-matched item can carry a real TVDB id ahead of the alias.
    const result = await service.get(
      1,
      showItem({ providerIds: { tvdb: ['342040', F1_ALIAS] } }),
      'show',
      ruleGroup(),
    );

    expect(mockClient.getLeagueByExternalId).toHaveBeenCalledWith(
      F1_EXTERNAL_ID,
      expect.any(Array),
    );
    expect(result).toBe(true);
  });

  it('resolves the league by the reversed alias and returns addDate', async () => {
    mockClient.getLeagueByExternalId.mockResolvedValue({
      id: 3,
      externalId: F1_EXTERNAL_ID,
      name: 'Formula 1',
      monitored: true,
      added: '2025-12-04T02:29:15.000Z',
    });

    const result = await service.get(0, showItem(), 'show', ruleGroup());

    expect(mockClient.getLeagueByExternalId).toHaveBeenCalledWith(
      F1_EXTERNAL_ID,
      expect.any(Array),
    );
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString()).toBe('2025-12-04T02:29:15.000Z');
  });

  it('returns the league monitored flag at show scope', async () => {
    mockClient.getLeagueByExternalId.mockResolvedValue({
      id: 3,
      externalId: F1_EXTERNAL_ID,
      name: 'Formula 1',
      monitored: false,
      added: '2025-12-04T02:29:15.000Z',
    });

    const result = await service.get(1, showItem(), 'show', ruleGroup());
    expect(result).toBe(false);
  });

  describe('hasFutureEvents (property 14)', () => {
    const trackedLeague = {
      id: 3,
      externalId: F1_EXTERNAL_ID,
      name: 'Formula 1',
      monitored: true,
    };

    it('returns true when a scheduled event is still upcoming', async () => {
      mockClient.getLeagueByExternalId.mockResolvedValue(trackedLeague);
      mockClient.getLeagueEvents.mockResolvedValue([
        { id: 10, seasonNumber: 2026, eventDate: '2000-01-01T00:00:00.000Z' },
        { id: 11, seasonNumber: 2026, eventDate: '2099-01-01T00:00:00.000Z' },
      ]);

      const result = await service.get(14, showItem(), 'show', ruleGroup());
      expect(result).toBe(true);
    });

    it('prefers broadcastDate over eventDate', async () => {
      mockClient.getLeagueByExternalId.mockResolvedValue(trackedLeague);
      mockClient.getLeagueEvents.mockResolvedValue([
        {
          id: 10,
          seasonNumber: 2026,
          eventDate: '2000-01-01T00:00:00.000Z',
          broadcastDate: '2099-01-01T00:00:00.000Z',
        },
      ]);

      const result = await service.get(14, showItem(), 'show', ruleGroup());
      expect(result).toBe(true);
    });

    it('returns false when every event is in the past', async () => {
      mockClient.getLeagueByExternalId.mockResolvedValue(trackedLeague);
      mockClient.getLeagueEvents.mockResolvedValue([
        { id: 10, seasonNumber: 2026, eventDate: '2000-01-01T00:00:00.000Z' },
      ]);

      const result = await service.get(14, showItem(), 'show', ruleGroup());
      expect(result).toBe(false);
    });

    it('fails closed (undefined) when the events fetch fails', async () => {
      mockClient.getLeagueByExternalId.mockResolvedValue(trackedLeague);
      mockClient.getLeagueEvents.mockResolvedValue(undefined);

      const result = await service.get(14, showItem(), 'show', ruleGroup());
      expect(result).toBeUndefined();
    });
  });

  it('returns null when the league is not tracked in Sportarr', async () => {
    mockClient.getLeagueByExternalId.mockResolvedValue(null);
    const result = await service.get(1, showItem(), 'show', ruleGroup());
    expect(result).toBeNull();
  });

  it('fails closed (undefined) when the league lookup errors transiently', async () => {
    mockClient.getLeagueByExternalId.mockResolvedValue(undefined);
    const result = await service.get(1, showItem(), 'show', ruleGroup());
    expect(result).toBeUndefined();
  });

  it('fails closed (undefined) when the leagues list fetch fails', async () => {
    mockClient.getLeagues.mockResolvedValue(undefined);
    const result = await service.get(1, showItem(), 'show', ruleGroup());
    expect(result).toBeUndefined();
    expect(mockClient.getLeagueByExternalId).not.toHaveBeenCalled();
  });

  it('pulls the leagues list once per run through the lookup cache', async () => {
    mockClient.getLeagueByExternalId.mockResolvedValue({
      id: 3,
      externalId: F1_EXTERNAL_ID,
      name: 'Formula 1',
      monitored: true,
      added: '2025-12-04T02:29:15.000Z',
    });
    const cache = new ArrLookupCache();

    await service.get(1, showItem(), 'show', ruleGroup(), undefined, cache);
    await service.get(0, showItem(), 'show', ruleGroup(), undefined, cache);

    expect(mockClient.getLeagues).toHaveBeenCalledTimes(1);
  });

  it('memoizes the full-metadata fallback fetch per run', async () => {
    mockClient.getLeagueByExternalId.mockResolvedValue({
      id: 3,
      externalId: F1_EXTERNAL_ID,
      name: 'Formula 1',
      monitored: true,
      added: '2025-12-04T02:29:15.000Z',
    });
    // A lightweight item without providerIds forces the metadata re-fetch;
    // evaluating several properties must not re-fetch the same show (#3285).
    mockMediaServer.getMetadata.mockResolvedValue(showItem());
    const bare = createMediaItem({
      type: 'show',
      id: 'show-9',
      providerIds: {},
    });
    const cache = new ArrLookupCache();

    await service.get(1, bare, 'show', ruleGroup(), undefined, cache);
    await service.get(0, bare, 'show', ruleGroup(), undefined, cache);

    expect(mockMediaServer.getMetadata).toHaveBeenCalledTimes(1);
  });

  it('resolves an episode-scope hasFile via the parent show + event index', async () => {
    // Episode item: grandparent is the show, parentIndex is the season year,
    // index is the event position in that season.
    const episode = createMediaItem({
      type: 'episode',
      grandparentId: 'show-1',
      parentIndex: 2026,
      index: 5,
      providerIds: {},
    });
    mockMediaServer.getMetadata.mockResolvedValue(showItem());
    mockClient.getLeagueByExternalId.mockResolvedValue({
      id: 3,
      externalId: F1_EXTERNAL_ID,
      name: 'Formula 1',
      monitored: true,
      added: '2025-12-04T02:29:15.000Z',
    });
    mockClient.getLeagueEvents.mockResolvedValue([
      { id: 10, seasonNumber: 2026, episodeNumber: 5, hasFile: true },
      { id: 11, seasonNumber: 2026, episodeNumber: 6, hasFile: false },
    ]);

    const result = await service.get(12, episode, 'episode', {
      ...ruleGroup(),
      dataType: 'episode',
    } as any);

    expect(mockMediaServer.getMetadata).toHaveBeenCalledWith('show-1');
    expect(result).toBe(true);
  });

  describe('fail-closed on transient fetch failures', () => {
    beforeEach(() => {
      mockClient.getLeagueByExternalId.mockResolvedValue({
        id: 3,
        externalId: F1_EXTERNAL_ID,
        name: 'Formula 1',
        monitored: true,
        added: '2025-12-04T02:29:15.000Z',
        qualityProfileId: 7,
      });
    });

    it('returns undefined for downloadedEvents when the events fetch fails', async () => {
      // A failed fetch must not read as "0 downloaded events": that's the
      // value removal rules match on, so it would fail open during an outage.
      mockClient.getLeagueEvents.mockResolvedValue(undefined);

      const result = await service.get(8, showItem(), 'show', ruleGroup());
      expect(result).toBeUndefined();
    });

    it('returns undefined for the events count when the events fetch fails', async () => {
      mockClient.getLeagueEvents.mockResolvedValue(undefined);

      const result = await service.get(7, showItem(), 'show', ruleGroup());
      expect(result).toBeUndefined();
    });

    it('returns undefined for qualityProfileName when the profile fetch fails', async () => {
      mockClient.getQualityProfiles.mockResolvedValue(undefined);

      const result = await service.get(6, showItem(), 'show', ruleGroup());
      expect(result).toBeUndefined();
    });

    it('still returns real values when the fetches succeed', async () => {
      mockClient.getLeagueEvents.mockResolvedValue([
        { id: 10, seasonNumber: 2026, episodeNumber: 5, hasFile: true },
        { id: 11, seasonNumber: 2026, episodeNumber: 6, hasFile: false },
      ]);
      mockClient.getQualityProfiles.mockResolvedValue([
        { id: 7, name: 'HD-1080p', isDefault: true },
      ]);

      await expect(
        service.get(8, showItem(), 'show', ruleGroup()),
      ).resolves.toBe(1);
      await expect(
        service.get(6, showItem(), 'show', ruleGroup()),
      ).resolves.toBe('HD-1080p');
    });
  });
});
