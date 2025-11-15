export interface RadarrMovieOptions {
  title: string;
  qualityProfileId: number;
  minimumAvailability: string;
  tags: number[];
  profileId: number;
  year: number;
  rootFolderPath: string;
  tmdbId: number;
  monitored?: boolean;
  searchNow?: boolean;
}

export interface RadarrMovie {
  id: number;
  title: string;
  originalLanguage: RadarrLanguage;
  isAvailable: boolean;
  monitored: boolean;
  tmdbId: number;
  imdbId: string;
  titleSlug: string;
  folderName: string;
  path: string;
  qualityProfileId: number;
  added: string;
  downloaded: boolean;
  hasFile: boolean;
  movieFile?: RadarrMovieFile;
  sizeOnDisk: number;
  physicalRelease?: string;
  digitalRelease?: string;
  inCinemas?: string;
  tags: number[];
  ratings: RadarrRatings;
}

export interface RadarrLanguage {
  id: number;
  name: string | null;
}

interface RadarrRatings {
  imdb?: RatingChild;
  tmdb?: RatingChild;
  metacritic?: RatingChild;
  rottenTomatoes?: RatingChild;
  trakt?: RatingChild;
}

interface RatingChild {
  votes: number;
  value: number;
  type: 'user' | 'critic';
}

export interface RadarrInfo {
  appName: string;
  version: string;
  buildTime: string;
  isDebug: boolean;
  isProduction: boolean;
  isAdmin: boolean;
  isUserInteractive: boolean;
  startupPath: string;
  appData: string;
  osName: string;
  osVersion: string;
  isNetCore: boolean;
  isLinux: boolean;
  isOsx: boolean;
  isWindows: boolean;
  isDocker: boolean;
  mode: string;
  branch: string;
  authentication: string;
  sqliteVersion: string;
  migrationVersion: number;
  urlBase: string;
  runtimeVersion: string;
  runtimeName: string;
  startTime: string;
  packageVersion: string;
  packageAuthor: string;
  packageUpdateMechanism: string;
}

export interface RadarrMediaInfo {
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
}

export interface RadarrMovieFile {
  id: number;
  dateAdded: string;
  quality: RadarrQualityContainer;
  size: number;
  mediaInfo: RadarrMediaInfo;
  path: string;
  qualityCutoffNotMet: boolean;
}

export interface RadarrQualityContainer {
  quality: RadarrQuality;
}

export interface RadarrQuality {
  id: number;
  name: string;
  source: string;
  resolution: number;
  modifier: string;
}
