import axios, { AxiosError } from 'axios';
import { createMockLogger } from '../../../../test/utils/data';
import cacheManager from '../lib/cache';
import {
  TvdbArtworkType,
  TvdbMovieBase,
  TvdbSeriesBase,
} from './interfaces/tvdb.interface';
import { TvdbApiService } from './tvdb.service';

/**
 * Tests for pure utility methods on TvdbApiService.
 * Network-calling methods (getMovie, getSeries, etc.) are covered
 * indirectly through the TvdbMetadataProvider tests.
 */
const createService = () => {
  const settings = { tvdb_api_key: undefined } as any;
  const logger = createMockLogger();
  return new TvdbApiService(settings, logger);
};

const makeRecord = (overrides: Partial<TvdbSeriesBase> = {}): TvdbSeriesBase =>
  ({
    id: 81189,
    name: 'Test Series',
    image: '',
    artworks: [],
    remoteIds: [],
    ...overrides,
  }) as TvdbSeriesBase;

const makeMovieRecord = (
  overrides: Partial<TvdbMovieBase> = {},
): TvdbMovieBase =>
  ({
    id: 1234,
    name: 'Test Movie',
    image: '',
    artworks: [],
    remoteIds: [],
    ...overrides,
  }) as TvdbMovieBase;

describe('TvdbApiService', () => {
  let service: TvdbApiService;
  let postSpy: jest.SpiedFunction<typeof axios.post>;

  beforeEach(() => {
    cacheManager.getCache('tvdb').data.flushAll();
    postSpy = jest.spyOn(axios, 'post');
    postSpy.mockReset();
    service = createService();
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  describe('isAvailable', () => {
    it('returns false when no bearer token exists', () => {
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('handleSettingsUpdate', () => {
    it('keeps the current token until a replacement token is obtained', async () => {
      (service as any).updateBearerToken('old-token');
      postSpy.mockRejectedValue(new Error('invalid key'));

      await service.handleSettingsUpdate({
        oldSettings: { tvdb_api_key: 'old-key' },
        settings: { tvdb_api_key: 'new-key' },
      });

      expect(service.isAvailable()).toBe(true);
      expect(
        (service as any).axios.defaults.headers.common['Authorization'],
      ).toBe('Bearer old-token');
    });
  });

  describe('401 refresh', () => {
    it('refreshes the token once and retries the request after a 401', async () => {
      const getSpy = jest.spyOn((service as any).axios, 'get');
      const unauthorized = new AxiosError('expired token');
      Object.assign(unauthorized, { response: { status: 401 } });

      getSpy.mockRejectedValueOnce(unauthorized).mockResolvedValueOnce({
        data: {
          status: 'success',
          data: { id: 42, name: 'Movie' },
        },
      } as any);
      postSpy.mockResolvedValue({
        data: { data: { token: 'refreshed-token' } },
      } as any);
      service['settings'].tvdb_api_key = 'configured-key';

      const result = await service.getMovie(42);

      expect(postSpy).toHaveBeenCalledWith(
        'https://api4.thetvdb.com/v4/login',
        { apikey: 'configured-key' },
      );
      expect(getSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual(
        expect.objectContaining({ id: 42, name: 'Movie' }),
      );
      expect(
        (service as any).axios.defaults.headers.common['Authorization'],
      ).toBe('Bearer refreshed-token');

      getSpy.mockRestore();
    });
  });

  describe('getPosterUrl', () => {
    it('returns undefined for undefined record', () => {
      expect(service.getPosterUrl(undefined)).toBeUndefined();
    });

    it('returns the base image when present', () => {
      const record = makeRecord({ image: 'https://tvdb.com/poster.jpg' });
      expect(service.getPosterUrl(record)).toBe('https://tvdb.com/poster.jpg');
    });

    it('falls back to highest-scored poster artwork', () => {
      const record = makeRecord({
        image: '',
        artworks: [
          {
            id: 1,
            image: 'low.jpg',
            type: TvdbArtworkType.SERIES_POSTER,
            score: 10,
          } as any,
          {
            id: 2,
            image: 'high.jpg',
            type: TvdbArtworkType.SERIES_POSTER,
            score: 50,
          } as any,
          {
            id: 3,
            image: 'bg.jpg',
            type: TvdbArtworkType.SERIES_BACKGROUND,
            score: 100,
          } as any,
        ],
      });
      expect(service.getPosterUrl(record)).toBe('high.jpg');
    });

    it('falls back to highest-scored movie poster artwork', () => {
      const record = makeMovieRecord({
        image: '',
        artworks: [
          {
            id: 1,
            image: 'low.jpg',
            type: TvdbArtworkType.MOVIE_POSTER,
            score: 10,
          } as any,
          {
            id: 2,
            image: 'high.jpg',
            type: TvdbArtworkType.MOVIE_POSTER,
            score: 50,
          } as any,
          {
            id: 3,
            image: 'bg.jpg',
            type: TvdbArtworkType.MOVIE_BACKGROUND,
            score: 100,
          } as any,
        ],
      });
      expect(service.getPosterUrl(record, 'movie')).toBe('high.jpg');
    });
  });

  describe('getBackdropUrl', () => {
    it('returns the highest-scored background artwork', () => {
      const record = makeRecord({
        artworks: [
          {
            id: 1,
            image: 'bg1.jpg',
            type: TvdbArtworkType.SERIES_BACKGROUND,
            score: 5,
          } as any,
          {
            id: 2,
            image: 'bg2.jpg',
            type: TvdbArtworkType.SERIES_BACKGROUND,
            score: 20,
          } as any,
        ],
      });
      expect(service.getBackdropUrl(record)).toBe('bg2.jpg');
    });

    it('returns undefined when no background artwork exists', () => {
      expect(service.getBackdropUrl(makeRecord())).toBeUndefined();
    });

    it('returns the highest-scored movie background artwork', () => {
      const record = makeMovieRecord({
        artworks: [
          {
            id: 1,
            image: 'bg1.jpg',
            type: TvdbArtworkType.MOVIE_BACKGROUND,
            score: 5,
          } as any,
          {
            id: 2,
            image: 'bg2.jpg',
            type: TvdbArtworkType.MOVIE_BACKGROUND,
            score: 20,
          } as any,
        ],
      });
      expect(service.getBackdropUrl(record, 'movie')).toBe('bg2.jpg');
    });
  });

  describe('getImdbId', () => {
    it('finds IMDB ID by sourceName', () => {
      const record = makeRecord({
        remoteIds: [
          { id: '550', sourceName: 'TheMovieDB.com', type: 12 },
          { id: 'tt0903747', sourceName: 'IMDB', type: 2 },
        ],
      });
      expect(service.getImdbId(record)).toBe('tt0903747');
    });

    it('finds IMDB ID by tt prefix', () => {
      const record = makeRecord({
        remoteIds: [{ id: 'tt0137523', sourceName: 'Other', type: 2 }],
      });
      expect(service.getImdbId(record)).toBe('tt0137523');
    });

    it('returns undefined when no IMDB remote', () => {
      expect(service.getImdbId(makeRecord())).toBeUndefined();
      expect(service.getImdbId(undefined)).toBeUndefined();
    });
  });

  describe('getTmdbId', () => {
    it.each(['TheMovieDB.com', 'TMDB', 'themoviedb'])(
      'finds TMDB ID with sourceName "%s"',
      (sourceName) => {
        const record = makeRecord({
          remoteIds: [{ id: '1396', sourceName, type: 12 }],
        });
        expect(service.getTmdbId(record)).toBe(1396);
      },
    );

    it('returns undefined for non-numeric TMDB id', () => {
      const record = makeRecord({
        remoteIds: [{ id: 'abc', sourceName: 'TMDB', type: 12 }],
      });
      expect(service.getTmdbId(record)).toBeUndefined();
    });

    it('returns undefined when no remoteIds', () => {
      expect(service.getTmdbId(undefined)).toBeUndefined();
    });
  });
});
