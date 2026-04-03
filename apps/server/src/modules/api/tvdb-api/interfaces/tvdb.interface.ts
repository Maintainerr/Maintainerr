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

export interface TvdbBiography {
  biography: string;
  language: string;
}

export interface TvdbPersonExtended {
  id: number;
  name: string;
  image: string | null;
  birth: string | null;
  death: string | null;
  birthPlace: string | null;
  gender: number;
  slug: string;
  biographies: TvdbBiography[];
  remoteIds: TvdbRemoteId[];
}

export interface TvdbRemoteIdResult {
  series: TvdbSeriesBase | null;
  movie: TvdbMovieBase | null;
}

export enum TvdbArtworkType {
  SERIES_BANNER = 1,
  SERIES_POSTER = 2,
  SERIES_BACKGROUND = 3,
  SERIES_ICON = 5,
  SEASON_POSTER = 7,
  SERIES_CLEAR_ART = 22,
  SERIES_CLEAR_LOGO = 23,
  MOVIE_POSTER = 14,
  MOVIE_BACKGROUND = 15,
  MOVIE_BANNER = 16,
  MOVIE_ICON = 18,
  MOVIE_CLEAR_ART = 24,
  MOVIE_CLEAR_LOGO = 25,
}
