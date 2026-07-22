import {
  createSonarrEpisode,
  createSonarrSeries,
} from '../../../../../test/utils/data';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SonarrApi } from './sonarr.helper';

describe('SonarrApi', () => {
  let sonarrApi: SonarrApi;
  let logger: jest.Mocked<MaintainerrLogger>;

  beforeEach(() => {
    logger = {
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<MaintainerrLogger>;

    sonarrApi = new SonarrApi(
      { url: 'http://localhost:8989', apiKey: 'test' },
      logger,
    );
  });

  it('should match episodes by air date when episode numbers are empty', async () => {
    const matchingEpisode = createSonarrEpisode({
      id: 101,
      seasonNumber: 2026,
      episodeNumber: 5,
      airDate: '2026-01-05',
      episodeFileId: 501,
    });
    const otherEpisode = createSonarrEpisode({
      id: 102,
      seasonNumber: 2026,
      episodeNumber: 6,
      airDate: '2026-01-06',
      episodeFileId: 502,
    });

    jest
      .spyOn(sonarrApi as any, 'get')
      .mockResolvedValue([matchingEpisode, otherEpisode]);
    const runPutSpy = jest
      .spyOn(sonarrApi as any, 'runPut')
      .mockResolvedValue(true);
    const runDeleteSpy = jest
      .spyOn(sonarrApi as any, 'runDelete')
      .mockResolvedValue(true);

    await sonarrApi.UnmonitorDeleteEpisodes(
      1,
      2026,
      [],
      true,
      new Date('2026-01-05T00:00:00.000Z'),
    );

    expect(runPutSpy).toHaveBeenCalledTimes(1);
    expect(runPutSpy).toHaveBeenCalledWith(
      `episode/${matchingEpisode.id}`,
      JSON.stringify({ ...matchingEpisode, monitored: false }),
    );
    expect(runDeleteSpy).toHaveBeenCalledTimes(1);
    expect(runDeleteSpy).toHaveBeenCalledWith(
      `episodefile/${matchingEpisode.episodeFileId}`,
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Deleting 1 episode(s) from show with ID 1 from Sonarr.',
    );
  });

  it('should log actual matched count when an air date matches multiple episodes', async () => {
    const firstMatchingEpisode = createSonarrEpisode({
      id: 101,
      seasonNumber: 2026,
      episodeNumber: 5,
      airDate: '2026-01-05',
      episodeFileId: 501,
    });
    const secondMatchingEpisode = createSonarrEpisode({
      id: 102,
      seasonNumber: 2026,
      episodeNumber: 6,
      airDate: '2026-01-05',
      episodeFileId: 502,
    });

    jest
      .spyOn(sonarrApi as any, 'get')
      .mockResolvedValue([firstMatchingEpisode, secondMatchingEpisode]);
    const runPutSpy = jest
      .spyOn(sonarrApi as any, 'runPut')
      .mockResolvedValue(true);
    const runDeleteSpy = jest
      .spyOn(sonarrApi as any, 'runDelete')
      .mockResolvedValue(true);

    await sonarrApi.UnmonitorDeleteEpisodes(
      1,
      2026,
      [],
      true,
      new Date('2026-01-05T00:00:00.000Z'),
    );

    expect(runPutSpy).toHaveBeenCalledTimes(2);
    expect(runDeleteSpy).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledWith(
      'Deleting 2 episode(s) from show with ID 1 from Sonarr.',
    );
  });

  it('should return no matches when explicit episode numbers are all undefined', async () => {
    jest
      .spyOn(sonarrApi as any, 'get')
      .mockResolvedValue([
        createSonarrEpisode({ episodeNumber: 1 }),
        createSonarrEpisode({ episodeNumber: 2 }),
      ]);

    await expect(
      sonarrApi.getEpisodes(1, 1, [undefined as unknown as number]),
    ).resolves.toEqual([]);
  });

  it('should include season 0 when fetching specials', async () => {
    const getSpy = jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([]);

    await expect(sonarrApi.getEpisodes(1, 0)).resolves.toEqual([]);

    expect(getSpy).toHaveBeenCalledWith('/episode?seriesId=1&seasonNumber=0');
  });

  it('should rethrow when episode lookup fails', async () => {
    jest.spyOn(sonarrApi as any, 'get').mockRejectedValue(new Error('boom'));

    await expect(sonarrApi.getEpisodes(1, 1, [1])).rejects.toThrow('boom');
  });

  it('should log a usable message when episode lookup throws a non-Error value', async () => {
    jest.spyOn(sonarrApi as any, 'get').mockRejectedValue('boom');

    await expect(sonarrApi.getEpisodes(1, 1, [1])).rejects.toBe('boom');

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to retrieve show 1's episodes 1: boom",
    );
  });

  it('should use episode numbers and episode file ids for existing-season cleanup', async () => {
    const episode = createSonarrEpisode({
      id: 99,
      seasonNumber: 3,
      episodeNumber: 7,
      episodeFileId: 700,
    });
    const series = createSonarrSeries({
      id: 1,
      seasons: [{ seasonNumber: 3, monitored: true }],
    });

    jest.spyOn(sonarrApi, 'getEpisodes').mockResolvedValue([episode]);
    jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(true);
    const runDeleteSpy = jest
      .spyOn(sonarrApi as any, 'runDelete')
      .mockResolvedValue(true);
    const unmonitorDeleteEpisodesSpy = jest
      .spyOn(sonarrApi, 'UnmonitorDeleteEpisodes')
      .mockResolvedValue(true);
    jest.spyOn((sonarrApi as any).axios, 'get').mockResolvedValue({
      data: series,
    });

    await expect(sonarrApi.unmonitorSeasons(1, 'existing')).resolves.toEqual(
      expect.objectContaining({ id: 1 }),
    );

    expect(unmonitorDeleteEpisodesSpy).toHaveBeenCalledWith(1, 3, [7], false);
    expect(runDeleteSpy).toHaveBeenCalledWith('episodefile/700');
  });

  it('should skip file deletes when the season unmonitor fails (#3228)', async () => {
    const episode = createSonarrEpisode({
      id: 99,
      seasonNumber: 3,
      episodeNumber: 7,
      episodeFileId: 700,
    });
    const series = createSonarrSeries({
      id: 1,
      seasons: [{ seasonNumber: 3, monitored: true }],
    });

    jest.spyOn(sonarrApi, 'getEpisodes').mockResolvedValue([episode]);
    jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(false);
    const runDeleteSpy = jest
      .spyOn(sonarrApi as any, 'runDelete')
      .mockResolvedValue(true);
    jest.spyOn((sonarrApi as any).axios, 'get').mockResolvedValue({
      data: series,
    });

    await expect(sonarrApi.unmonitorSeasons(1, 3)).resolves.toBeUndefined();

    expect(runDeleteSpy).not.toHaveBeenCalled();
  });

  describe('cache coherency (issue #2757 / #2891)', () => {
    it('getSeriesByTvdbId reads uncached so post-mutation state is never stale', async () => {
      const series = createSonarrSeries({ id: 1, tvdbId: 555 });
      const getSpy = jest
        .spyOn(sonarrApi as any, 'get')
        .mockResolvedValue([series]);
      const getWithoutCacheSpy = jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([series]);

      await sonarrApi.getSeriesByTvdbId(555);

      expect(getWithoutCacheSpy).toHaveBeenCalledWith('/series?tvdbId=555', {
        timeout: 20000,
      });
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  // The transient-failure protection in rule evaluation depends on this
  // contract: `undefined` = the lookup itself failed (fail closed), `null` =
  // Sonarr confirmed the series isn't tracked. getWithoutCache swallows HTTP
  // errors to `undefined` without throwing, so the failure must be detected
  // from that value - the catch path never sees it. (#3125)
  describe('getSeriesByTvdbId null/undefined contract (#3125)', () => {
    it('returns undefined when the lookup fails transiently (getWithoutCache → undefined)', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);

      await expect(sonarrApi.getSeriesByTvdbId(555)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Error retrieving show by tvdb ID 555',
      );
    });

    it('returns null when Sonarr confirms the series is not tracked (empty array)', async () => {
      jest.spyOn(sonarrApi as any, 'getWithoutCache').mockResolvedValue([]);

      await expect(sonarrApi.getSeriesByTvdbId(555)).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not retrieve show by tvdb ID 555',
      );
    });

    it('returns the series when Sonarr has it', async () => {
      const series = createSonarrSeries({ id: 1, tvdbId: 555 });
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([series]);

      await expect(sonarrApi.getSeriesByTvdbId(555)).resolves.toEqual(
        expect.objectContaining({ id: 1 }),
      );
    });
  });

  // Same null/undefined contract as getSeriesByTvdbId, plus the safety rules
  // that make a title-based fallback acceptable at all: tracked-only, exact
  // match, unambiguous. Anything less resolves to null.
  describe('getTrackedSeriesByExactTitle', () => {
    it('returns undefined when the lookup fails transiently (getWithoutCache → undefined)', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);

      await expect(
        sonarrApi.getTrackedSeriesByExactTitle('Formula 1'),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        "Error looking up series by title 'Formula 1'",
      );
    });

    it('returns the series on an unambiguous exact tracked match', async () => {
      const tracked = createSonarrSeries({ id: 7, title: 'Formula 1' });
      const untrackedLookupResult = createSonarrSeries({
        id: 0,
        title: 'Formula 1',
      });
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([untrackedLookupResult, tracked]);

      await expect(
        sonarrApi.getTrackedSeriesByExactTitle('Formula 1'),
      ).resolves.toEqual(expect.objectContaining({ id: 7 }));
    });

    it('matches case-insensitively and trims the term', async () => {
      const tracked = createSonarrSeries({ id: 7, title: 'Formula 1' });
      const getWithoutCacheSpy = jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([tracked]);

      await expect(
        sonarrApi.getTrackedSeriesByExactTitle('  formula 1  '),
      ).resolves.toEqual(expect.objectContaining({ id: 7 }));
      expect(getWithoutCacheSpy).toHaveBeenCalledWith('/series/lookup', {
        params: { term: 'formula 1' },
        timeout: 20000,
      });
    });

    it('returns null when only untracked lookup results match', async () => {
      // /series/lookup merges remote results (id 0/absent) with library
      // entries; a fallback must never act on a series the instance does
      // not track.
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([createSonarrSeries({ id: 0, title: 'Formula 1' })]);

      await expect(
        sonarrApi.getTrackedSeriesByExactTitle('Formula 1'),
      ).resolves.toBeNull();
    });

    it('returns null when the exact match is ambiguous', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([
          createSonarrSeries({ id: 7, title: 'Formula 1' }),
          createSonarrSeries({ id: 8, title: 'Formula 1' }),
        ]);

      await expect(
        sonarrApi.getTrackedSeriesByExactTitle('Formula 1'),
      ).resolves.toBeNull();
    });

    it('ignores partial title matches', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([
          createSonarrSeries({ id: 7, title: 'Formula 1: Drive to Survive' }),
        ]);

      await expect(
        sonarrApi.getTrackedSeriesByExactTitle('Formula 1'),
      ).resolves.toBeNull();
    });

    it('returns null without calling Sonarr when the title is blank', async () => {
      const getWithoutCacheSpy = jest.spyOn(
        sonarrApi as any,
        'getWithoutCache',
      );

      await expect(
        sonarrApi.getTrackedSeriesByExactTitle('   '),
      ).resolves.toBeNull();
      expect(getWithoutCacheSpy).not.toHaveBeenCalled();
    });
  });

  describe('runPut / runDelete failure contract', () => {
    it('should return false when PUT returns undefined (API failure)', async () => {
      jest.spyOn(sonarrApi as any, 'put').mockResolvedValue(undefined);

      const result = await (sonarrApi as any).runPut(
        'episode/1',
        JSON.stringify({ monitored: false }),
      );

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('Failed to run PUT: /episode/1');
    });

    it('should return true when PUT returns data (API success)', async () => {
      jest.spyOn(sonarrApi as any, 'put').mockResolvedValue({ id: 1 });

      const result = await (sonarrApi as any).runPut(
        'episode/1',
        JSON.stringify({ monitored: false }),
      );

      expect(result).toBe(true);
    });

    it('should return false when DELETE returns undefined (API failure)', async () => {
      jest.spyOn(sonarrApi as any, 'delete').mockResolvedValue(undefined);

      const result = await (sonarrApi as any).runDelete('episodefile/1');

      expect(result).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to run DELETE: /episodefile/1',
      );
    });

    it('should return true when DELETE returns data (API success)', async () => {
      jest.spyOn(sonarrApi as any, 'delete').mockResolvedValue({});

      const result = await (sonarrApi as any).runDelete('episodefile/1');

      expect(result).toBe(true);
    });
  });

  describe('getSeriesDownloadHistory', () => {
    it('requests the series history endpoint', async () => {
      const getWithoutCache = jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([]);

      await sonarrApi.getSeriesDownloadHistory(42);

      expect(getWithoutCache).toHaveBeenCalledWith(
        '/history/series?seriesId=42',
      );
    });

    it('keeps only grabbed/import events, lowercases the hash, and carries the episodeId', async () => {
      jest.spyOn(sonarrApi as any, 'getWithoutCache').mockResolvedValue([
        { id: 1, eventType: 'grabbed', downloadId: 'ABCDEF', episodeId: 10 },
        {
          id: 2,
          eventType: 'downloadFolderImported',
          downloadId: 'abcdef',
          episodeId: 10,
        },
        // non-file events must be ignored: they don't establish that the torrent
        // backs a wanted file.
        {
          id: 3,
          eventType: 'downloadFailed',
          downloadId: 'failed',
          episodeId: 11,
        },
        {
          id: 4,
          eventType: 'episodeFileDeleted',
          downloadId: 'gone',
          episodeId: 12,
        },
        {
          id: 5,
          eventType: 'downloadIgnored',
          downloadId: 'ignored',
          episodeId: 13,
        },
      ]);

      const result = await sonarrApi.getSeriesDownloadHistory(1);

      expect(result).toEqual([
        { hash: 'abcdef', episodeId: 10 },
        { hash: 'abcdef', episodeId: 10 },
      ]);
    });

    it('falls back to data.torrentInfoHash when downloadId is absent', async () => {
      jest.spyOn(sonarrApi as any, 'getWithoutCache').mockResolvedValue([
        {
          id: 1,
          eventType: 'grabbed',
          episodeId: 7,
          data: { torrentInfoHash: 'HASH-X' },
        },
      ]);

      const result = await sonarrApi.getSeriesDownloadHistory(1);

      expect(result).toEqual([{ hash: 'hash-x', episodeId: 7 }]);
    });

    it('drops rows that have neither a downloadId nor a torrentInfoHash', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue([{ id: 1, eventType: 'grabbed', episodeId: 7 }]);

      const result = await sonarrApi.getSeriesDownloadHistory(1);

      expect(result).toEqual([]);
    });

    it('returns [] when the history response is not an array', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);

      const result = await sonarrApi.getSeriesDownloadHistory(1);

      expect(result).toEqual([]);
    });

    it('returns [] when the history fetch throws', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockRejectedValue(new Error('boom'));

      await expect(sonarrApi.getSeriesDownloadHistory(1)).resolves.toEqual([]);
    });

    it('falls back to torrentInfoHash when downloadId is empty or whitespace', async () => {
      jest.spyOn(sonarrApi as any, 'getWithoutCache').mockResolvedValue([
        {
          id: 1,
          eventType: 'grabbed',
          downloadId: '   ',
          episodeId: 7,
          data: { torrentInfoHash: 'HASH-Y' },
        },
      ]);

      const result = await sonarrApi.getSeriesDownloadHistory(1);

      expect(result).toEqual([{ hash: 'hash-y', episodeId: 7 }]);
    });
  });

  describe('getDownloadIdsForSeries', () => {
    it('returns deduped, lowercased ids from grab/import events only', async () => {
      jest.spyOn(sonarrApi as any, 'getWithoutCache').mockResolvedValue([
        { id: 1, eventType: 'grabbed', downloadId: 'ABCDEF', episodeId: 1 },
        {
          id: 2,
          eventType: 'downloadFolderImported',
          downloadId: '  abcdef  ',
          episodeId: 1,
        },
        { id: 3, eventType: 'grabbed', downloadId: 'ghijkl', episodeId: 2 },
        { id: 4, eventType: 'grabbed', episodeId: 3 }, // no hash -> dropped
        // failed grab: a torrent that never produced a file -> not removed
        {
          id: 5,
          eventType: 'downloadFailed',
          downloadId: 'failed',
          episodeId: 4,
        },
      ]);

      const result = await sonarrApi.getDownloadIdsForSeries(1);

      expect(result).toEqual(['abcdef', 'ghijkl']);
    });

    it('returns [] when the fetch throws', async () => {
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockRejectedValue(new Error('boom'));

      await expect(sonarrApi.getDownloadIdsForSeries(1)).resolves.toEqual([]);
    });
  });

  describe('setSeriesTags', () => {
    it('adds a tag to a batch of series via the series editor', async () => {
      const runPut = jest
        .spyOn(sonarrApi as any, 'runPut')
        .mockResolvedValue(true);

      await expect(sonarrApi.setSeriesTags([1, 2], 7, 'add')).resolves.toBe(
        true,
      );

      expect(runPut).toHaveBeenCalledWith(
        'series/editor',
        JSON.stringify({ seriesIds: [1, 2], tags: [7], applyTags: 'add' }),
      );
    });

    it('removes a tag via the series editor', async () => {
      const runPut = jest
        .spyOn(sonarrApi as any, 'runPut')
        .mockResolvedValue(true);

      await sonarrApi.setSeriesTags([3], 7, 'remove');

      expect(runPut).toHaveBeenCalledWith(
        'series/editor',
        JSON.stringify({ seriesIds: [3], tags: [7], applyTags: 'remove' }),
      );
    });

    it('no-ops on an empty id list (no request)', async () => {
      const runPut = jest.spyOn(sonarrApi as any, 'runPut');

      await expect(sonarrApi.setSeriesTags([], 7, 'add')).resolves.toBe(true);
      expect(runPut).not.toHaveBeenCalled();
    });
  });

  describe('UnmonitorDeleteEpisodes slow-PUT race condition (#3228)', () => {
    it('deletes the episode file when PUT timed out but Sonarr confirms unmonitored (timeout race)', async () => {
      const episode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-01-05',
        episodeFileId: 501,
        monitored: true,
      });
      jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([episode]);
      jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(false);
      const getWithoutCacheSpy = jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue({
          ...episode,
          monitored: false,
          episodeFileId: 601,
        });
      const runDeleteSpy = jest
        .spyOn(sonarrApi as any, 'runDelete')
        .mockResolvedValue(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        true,
        new Date('2026-01-05T00:00:00.000Z'),
      );

      // Same slow-Sonarr headroom as getSeriesByTvdbId (#3181), and the delete
      // uses the live file id, not the possibly stale cached one.
      expect(getWithoutCacheSpy).toHaveBeenCalledWith('/episode/101', {
        timeout: 20000,
      });
      expect(runDeleteSpy).toHaveBeenCalledWith('episodefile/601');
      expect(result).toBe(true);
    });

    it('performs no verification read when the PUT succeeds', async () => {
      const episode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-01-05',
        episodeFileId: 501,
        monitored: true,
      });
      jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([episode]);
      jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(true);
      const getWithoutCacheSpy = jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);
      jest.spyOn(sonarrApi as any, 'runDelete').mockResolvedValue(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        true,
        new Date('2026-01-05T00:00:00.000Z'),
      );

      expect(getWithoutCacheSpy).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('reports success without deleting when PUT timed out but Sonarr confirms unmonitored (deleteFiles=false)', async () => {
      const episode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-01-05',
        episodeFileId: 501,
        monitored: true,
      });
      jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([episode]);
      jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(false);
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue({ ...episode, monitored: false });
      const runDeleteSpy = jest
        .spyOn(sonarrApi as any, 'runDelete')
        .mockResolvedValue(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        false,
        new Date('2026-01-05T00:00:00.000Z'),
      );

      expect(runDeleteSpy).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('warns without the file clause when unconfirmed and no delete was requested (deleteFiles=false)', async () => {
      const episode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-01-05',
        episodeFileId: 501,
        monitored: true,
      });
      jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([episode]);
      jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(false);
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue({ ...episode, monitored: true });
      const runDeleteSpy = jest
        .spyOn(sonarrApi as any, 'runDelete')
        .mockResolvedValue(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        false,
        new Date('2026-01-05T00:00:00.000Z'),
      );

      expect(runDeleteSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not confirm episode 101 was unmonitored.',
      );
      expect(result).toBe(false);
    });

    it('skips the file delete and warns when PUT failed and Sonarr confirms still monitored (genuine failure)', async () => {
      const episode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-01-05',
        episodeFileId: 501,
        monitored: true,
      });
      jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([episode]);
      jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(false);
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue({ ...episode, monitored: true });
      const runDeleteSpy = jest
        .spyOn(sonarrApi as any, 'runDelete')
        .mockResolvedValue(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        true,
        new Date('2026-01-05T00:00:00.000Z'),
      );

      expect(runDeleteSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Could not confirm episode 101 was unmonitored; leaving its file in place.',
      );
      expect(result).toBe(false);
    });

    it('skips the file delete when PUT failed and the verification lookup returns undefined (fail closed)', async () => {
      const episode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-01-05',
        episodeFileId: 501,
        monitored: true,
      });
      jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([episode]);
      jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(false);
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue(undefined);
      const runDeleteSpy = jest
        .spyOn(sonarrApi as any, 'runDelete')
        .mockResolvedValue(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        true,
        new Date('2026-01-05T00:00:00.000Z'),
      );

      expect(runDeleteSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('processes remaining episodes after a single failure (batch no longer aborts)', async () => {
      const firstEpisode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-07-01',
        episodeFileId: 501,
        monitored: true,
      });
      const secondEpisode = createSonarrEpisode({
        id: 102,
        seasonNumber: 2026,
        episodeNumber: 6,
        airDate: '2026-07-01',
        episodeFileId: 502,
        monitored: true,
      });

      jest
        .spyOn(sonarrApi as any, 'get')
        .mockResolvedValue([firstEpisode, secondEpisode]);
      jest
        .spyOn(sonarrApi as any, 'runPut')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      jest
        .spyOn(sonarrApi as any, 'getWithoutCache')
        .mockResolvedValue({ ...firstEpisode, monitored: true });
      const runDeleteSpy = jest
        .spyOn(sonarrApi as any, 'runDelete')
        .mockResolvedValue(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        true,
        new Date('2026-07-01T00:00:00.000Z'),
      );

      expect(runDeleteSpy).toHaveBeenCalledWith('episodefile/502');
      expect(runDeleteSpy).not.toHaveBeenCalledWith('episodefile/501');
      expect(result).toBe(false);
    });

    it('continues deleting remaining files after one file delete fails (delete failure no longer aborts)', async () => {
      const firstEpisode = createSonarrEpisode({
        id: 101,
        seasonNumber: 2026,
        episodeNumber: 5,
        airDate: '2026-07-01',
        episodeFileId: 501,
        monitored: true,
      });
      const secondEpisode = createSonarrEpisode({
        id: 102,
        seasonNumber: 2026,
        episodeNumber: 6,
        airDate: '2026-07-01',
        episodeFileId: 502,
        monitored: true,
      });

      jest
        .spyOn(sonarrApi as any, 'get')
        .mockResolvedValue([firstEpisode, secondEpisode]);
      jest.spyOn(sonarrApi as any, 'runPut').mockResolvedValue(true);
      const runDeleteSpy = jest
        .spyOn(sonarrApi as any, 'runDelete')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await sonarrApi.UnmonitorDeleteEpisodes(
        1,
        2026,
        [],
        true,
        new Date('2026-07-01T00:00:00.000Z'),
      );

      expect(runDeleteSpy).toHaveBeenCalledWith('episodefile/501');
      expect(runDeleteSpy).toHaveBeenCalledWith('episodefile/502');
      expect(runDeleteSpy).toHaveBeenCalledTimes(2);
      expect(result).toBe(false);
    });
  });
});
