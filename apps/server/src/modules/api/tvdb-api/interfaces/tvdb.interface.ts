/**
 * TVDB v4 API response interfaces.
 * Based on https://thetvdb.github.io/v4-api/
 */

/** Wrapper used by most TVDB v4 endpoints */
export interface TvdbApiResponse<T> {
  status: string;
  data: T;
}

export interface TvdbAlias {
  language: string;
  name: string;
}

export interface TvdbArtwork {
  id: number;
  image: string;
  thumbnail: string;
  language: string | null;
  type: number;
  score: number;
  width: number;
  height: number;
}

export interface TvdbRemoteId {
  id: string;
  type: number;
  sourceName: string;
}

export interface TvdbSeriesBase {
  id: number;
  name: string;
  slug: string;
  image: string;
  nameTranslations: string[];
  overviewTranslations: string[];
  aliases: TvdbAlias[];
  firstAired: string | null;
  lastAired: string | null;
  nextAired: string | null;
  score: number;
  status: {
    id: number;
    name: string;
    recordType: string;
    keepUpdated: boolean;
  };
  originalCountry: string;
  originalLanguage: string;
  defaultSeasonType: number;
  isOrderRandomized: boolean;
  lastUpdated: string;
  averageRuntime: number;
  overview: string | null;
  year: string;
  artworks: TvdbArtwork[];
  remoteIds: TvdbRemoteId[];
}

export interface TvdbMovieBase {
  id: number;
  name: string;
  slug: string;
  image: string;
  nameTranslations: string[];
  overviewTranslations: string[];
  aliases: TvdbAlias[];
  score: number;
  status: {
    id: number;
    name: string;
    recordType: string;
    keepUpdated: boolean;
  };
  originalCountry: string;
  originalLanguage: string;
  lastUpdated: string;
  runtime: number;
  overview: string | null;
  year: string;
  artworks: TvdbArtwork[];
  remoteIds: TvdbRemoteId[];
}

export interface TvdbSearchResult {
  objectID: string;
  aliases: string[];
  country: string;
  id: string;
  image_url: string;
  name: string;
  first_air_time: string;
  overview: string;
  primary_language: string;
  primary_type: string;
  status: string;
  type: string;
  tvdb_id: string;
  year: string;
  slug: string;
  overviewTranslations: string[];
  translations: Record<string, string>;
  network: string;
  remote_ids: { id: string; type: number; sourceName: string }[];
  thumbnail: string;
}

/** Result from /search/remoteid/{remoteId} */
export interface TvdbRemoteIdResult {
  series: TvdbSeriesBase | null;
  movie: TvdbMovieBase | null;
}

/**
 * TVDB Artwork types (from their documentation):
 *  1 = Banner
 *  2 = Poster
 *  3 = Background/Fanart
 *  6 = Series icon
 *  7 = Season poster
 * 14 = ClearArt
 * 15 = ClearLogo
 */
export enum TvdbArtworkType {
  BANNER = 1,
  POSTER = 2,
  BACKGROUND = 3,
  ICON = 6,
  SEASON_POSTER = 7,
  CLEAR_ART = 14,
  CLEAR_LOGO = 15,
}
