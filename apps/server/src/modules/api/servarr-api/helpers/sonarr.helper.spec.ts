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
    jest.spyOn(sonarrApi as any, 'get').mockResolvedValue([
      createSonarrEpisode({ episodeNumber: 1 }),
      createSonarrEpisode({ episodeNumber: 2 }),
    ]);

    await expect(
      sonarrApi.getEpisodes(1, 1, [undefined as unknown as number]),
    ).resolves.toEqual([]);
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
});