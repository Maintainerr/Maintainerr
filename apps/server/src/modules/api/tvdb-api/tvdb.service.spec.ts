import {
  TvdbArtworkType,
  TvdbMovieBase,
  TvdbSeriesBase,
} from './interfaces/tvdb.interface';
import { TvdbApiService } from './tvdb.service';
import { createMockLogger } from '../../../../test/utils/data';

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

const makeRecord = (
  overrides: Partial<TvdbSeriesBase> = {},
): TvdbSeriesBase =>
  ({
    id: 81189,
    name: 'Breaking Bad',
    image: '',
    artworks: [],
    remoteIds: [],
    ...overrides,
  }) as TvdbSeriesBase;

describe('TvdbApiService', () => {
  let service: TvdbApiService;

  beforeEach(() => {
    service = createService();
  });

  describe('isAvailable', () => {
    it('returns false when no bearer token exists', () => {
      expect(service.isAvailable()).toBe(false);
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
          { id: 1, image: 'low.jpg', type: TvdbArtworkType.POSTER, score: 10 } as any,
          { id: 2, image: 'high.jpg', type: TvdbArtworkType.POSTER, score: 50 } as any,
          { id: 3, image: 'bg.jpg', type: TvdbArtworkType.BACKGROUND, score: 100 } as any,
        ],
      });
      expect(service.getPosterUrl(record)).toBe('high.jpg');
    });
  });

  describe('getBackdropUrl', () => {
    it('returns the highest-scored background artwork', () => {
      const record = makeRecord({
        artworks: [
          { id: 1, image: 'bg1.jpg', type: TvdbArtworkType.BACKGROUND, score: 5 } as any,
          { id: 2, image: 'bg2.jpg', type: TvdbArtworkType.BACKGROUND, score: 20 } as any,
        ],
      });
      expect(service.getBackdropUrl(record)).toBe('bg2.jpg');
    });

    it('returns undefined when no background artwork exists', () => {
      expect(service.getBackdropUrl(makeRecord())).toBeUndefined();
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
