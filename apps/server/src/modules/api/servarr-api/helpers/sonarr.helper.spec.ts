import { createSonarrEpisode } from '../../../../../test/utils/data';
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

  it('should rethrow when episode lookup fails', async () => {
    jest.spyOn(sonarrApi as any, 'get').mockRejectedValue(new Error('boom'));

    await expect(sonarrApi.getEpisodes(1, 1, [1])).rejects.toThrow('boom');
  });
});
