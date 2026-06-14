import { Mocked, TestBed } from '@suites/unit';
import {
  createCollectionMedia,
  createMediaItem,
  createRulesDto,
  createSonarrEpisode,
  createSonarrSeries,
} from '../../../../test/utils/data';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { SonarrApi } from '../../api/servarr-api/helpers/sonarr.helper';
import { ServarrService } from '../../api/servarr-api/servarr.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MetadataService } from '../../metadata/metadata.service';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import { SonarrGetterService } from './sonarr-getter.service';

const BENCH = process.env.MAINTAINERR_BENCH === '1';
const sizes = [100, 1000, 9000];

const describeMaybe = BENCH ? describe : describe.skip;

describeMaybe('episodeFileRank — benchmark', () => {
  jest.setTimeout(120_000);

  let sonarrGetterService: SonarrGetterService;
  let servarrService: Mocked<ServarrService>;
  let mediaServerFactory: Mocked<MediaServerFactory>;
  let mockMediaServer: { getMetadata: jest.Mock };
  let metadataService: Mocked<MetadataService>;
  let logger: Mocked<MaintainerrLogger>;

  beforeEach(async () => {
    const { unit, unitRef } =
      await TestBed.solitary(SonarrGetterService).compile();
    sonarrGetterService = unit;
    servarrService = unitRef.get(ServarrService);
    mediaServerFactory = unitRef.get(MediaServerFactory);
    metadataService = unitRef.get(MetadataService);
    logger = unitRef.get(MaintainerrLogger);

    metadataService.resolveLookupCandidatesFromMediaItemForService.mockResolvedValue(
      [{ providerKey: 'tvdb', id: 1 }] as any,
    );

    mockMediaServer = { getMetadata: jest.fn() };
    mediaServerFactory.getService.mockResolvedValue(
      mockMediaServer as unknown as IMediaServerService,
    );

    const pinnedNow = new Date('2026-06-13T12:00:00Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(pinnedNow);
  });

  afterEach(() => jest.restoreAllMocks());

  const makeMockApi = (
    series: any,
    episodes: any[],
    counter: { n: number },
  ) => {
    const mockedSonarrApi = new SonarrApi(
      { url: 'http://localhost:8989', apiKey: 'test' },
      logger as any,
    );
    jest.spyOn(mockedSonarrApi, 'getSeriesByTvdbId').mockResolvedValue(series);
    jest.spyOn(mockedSonarrApi, 'getEpisodes').mockImplementation(async () => {
      counter.n += 1;
      return episodes;
    });
    servarrService.getSonarrApiClient.mockResolvedValue(mockedSonarrApi);
    return mockedSonarrApi;
  };

  const buildEpisodes = (seriesId: number, n: number) => {
    const start = new Date('2000-01-01T00:00:00Z').getTime();
    const out: any[] = [];
    for (let i = 0; i < n; i++) {
      out.push(
        createSonarrEpisode({
          seriesId,
          seasonNumber: Math.floor(i / 24) + 1,
          episodeNumber: (i % 24) + 1,
          airDateUtc: new Date(start + i * 86_400_000).toISOString(),
          hasFile: true,
        }),
      );
    }
    return out;
  };

  const evalAllEpisodes = async (
    episodes: any[],
    cache: ArrLookupCache | undefined,
  ) => {
    const collectionMedia = createCollectionMedia('episode');
    collectionMedia.collection.sonarrSettingsId = 1;
    mockMediaServer.getMetadata.mockResolvedValue(
      createMediaItem({ type: 'show' }),
    );

    for (const ep of episodes) {
      await sonarrGetterService.get(
        32,
        createMediaItem({
          type: 'episode',
          index: ep.episodeNumber,
          parentIndex: ep.seasonNumber,
          parentId: `season-${ep.seasonNumber}`,
          grandparentId: 'show-1',
        }),
        'episode',
        createRulesDto({
          collection: collectionMedia.collection,
          dataType: 'episode',
        }),
        undefined,
        cache,
      );
    }
  };

  for (const n of sizes) {
    it(`evaluates N=${n} episodes — no cache vs ArrLookupCache`, async () => {
      const series = createSonarrSeries({ id: 7, seasons: [] });
      const episodes = buildEpisodes(series.id, n);

      // Cold path: no ArrLookupCache. Each get() call re-builds the rank map.
      const noCacheCalls = { n: 0 };
      makeMockApi(series, episodes, noCacheCalls);
      const t0 = process.hrtime.bigint();
      await evalAllEpisodes(episodes, undefined);
      const t1 = process.hrtime.bigint();
      const noCacheMs = Number(t1 - t0) / 1e6;

      // Cached path: shared ArrLookupCache across the rule-loop equivalent.
      const cacheCalls = { n: 0 };
      makeMockApi(series, episodes, cacheCalls);
      const cache = new ArrLookupCache();
      const t2 = process.hrtime.bigint();
      await evalAllEpisodes(episodes, cache);
      const t3 = process.hrtime.bigint();
      const cacheMs = Number(t3 - t2) / 1e6;

      const speedup = noCacheMs / cacheMs;
      const row = [
        `N=${String(n).padStart(5)}`,
        `no-cache: ${noCacheMs.toFixed(1).padStart(8)} ms`,
        `getEpisodes calls: ${String(noCacheCalls.n).padStart(5)}`,
        `cached:   ${cacheMs.toFixed(1).padStart(8)} ms`,
        `getEpisodes calls: ${String(cacheCalls.n).padStart(5)}`,
        `speedup: ${speedup.toFixed(1)}x`,
      ].join('  |  ');

      console.log(row);

      expect(cacheMs).toBeLessThan(noCacheMs);
      expect(cacheCalls.n).toBe(1);
      expect(noCacheCalls.n).toBe(n);
    });
  }
});
