export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    previousAiring?: string;
    nextAiring?: string;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}
export interface SonarrInfo {
  appName: string;
  version: string;
  buildTime: string;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osVersion: string;
  isMono: boolean;
  isLinux: boolean;
  isWindows: boolean;
  branch: string;
  authentication: boolean;
  startOfWeek: number;
  urlBase: string;
}

export interface SonarrEpisode {
  id: number;
  airDate: string;
  airDateUtc: string;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeFileId: number; // 0 if not downloaded
  hasFile: boolean;
  monitored: boolean;
  finaleType?: 'series' | 'season' | 'midseason';
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath: string;
  path: string;
  size: number;
  dateAdded: Date;
  sceneName?: string;
  releaseGroup?: string;
  quality?: {
    quality: {
      id: number;
      name: string;
      source: string;
      resolution: number;
    };
    revision?: {
      version: number;
      real: number;
      isRepack: boolean;
    };
  };
  mediaInfo?: {
    audioBitrate: number;
    audioChannels: number;
    audioCodec: string;
    audioLanguages: string;
    audioStreamCount: number;
    videoBitDepth: number;
    videoBitrate: number;
    videoCodec: string;
    videoFps: number;
    resolution: string;
    runTime: string;
    scanType: string;
    subtitles: string;
  };
  qualityCutoffNotMet: boolean;
}

export const SonarrSeriesStatusTypes = [
  'deleted',
  'ended',
  'continuing',
  'upcoming',
] as const;
export type SonarrSeriesStatusType = (typeof SonarrSeriesStatusTypes)[number];

export const SonarrSeriesTypes = ['standard', 'daily', 'anime'] as const;
export type SonarrSeriesType = (typeof SonarrSeriesTypes)[number];

export interface SonarrSeries {
  title: string;
  sortTitle: string;
  originalLanguage: SonarrLanguage;
  status: SonarrSeriesStatusType | null;
  overview: string;
  network: string;
  airTime: string;
  images: {
    coverType: string;
    url: string;
  }[];
  remotePoster: string;
  seasons: SonarrSeason[];
  year: number;
  path: string;
  seasonFolder: boolean;
  monitored: boolean;
  useSceneNumbering: boolean;
  runtime: number;
  tvdbId: number;
  tvRageId: number;
  tvMazeId: number;
  firstAired: string;
  lastInfoSync?: string;
  seriesType: SonarrSeriesType;
  cleanTitle: string;
  imdbId: string;
  titleSlug: string;
  certification: string;
  genres: string[];
  tags: number[];
  added: string;
  ratings: {
    votes: number;
    value: number;
  };
  qualityProfileId: number;
  id?: number;
  rootFolderPath?: string;
  addOptions?: {
    ignoreEpisodesWithFiles?: boolean;
    ignoreEpisodesWithoutFiles?: boolean;
    searchForMissingEpisodes?: boolean;
  };
  statistics?: SonarrStatistics;
  ended?: boolean;
}

export interface SonarrLanguage {
  id: number;
  name: string | null;
}

export interface SonarrStatistics {
  seasonCount: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
  percentOfEpisodes: number;
}
