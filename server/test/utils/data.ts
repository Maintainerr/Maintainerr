import { faker } from '@faker-js/faker';
import { EPlexDataType } from '../../src/modules/api/plex-api/enums/plex-data-type-enum';
import {
  PlexLibrary,
  PlexLibraryItem,
} from '../../src/modules/api/plex-api/interfaces/library.interfaces';
import { PlexMetadata } from '../../src/modules/api/plex-api/interfaces/media.interface';
import {
  RadarrMovie,
  RadarrMovieFile,
  RadarrQuality,
} from '../../src/modules/api/servarr-api/interfaces/radarr.interface';
import {
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrSeries,
  SonarrSeriesStatusTypes,
  SonarrSeriesTypes,
} from '../../src/modules/api/servarr-api/interfaces/sonarr.interface';
import { Collection } from '../../src/modules/collections/entities/collection.entities';
import {
  CollectionMedia,
  CollectionMediaWithPlexData,
} from '../../src/modules/collections/entities/collection_media.entities';
import { ServarrAction } from '../../src/modules/collections/interfaces/collection.interface';
import { RulesDto } from '../../src/modules/rules/dtos/rules.dto';

export const EPlexDataTypeToPlexTypeMap = {
  [EPlexDataType.MOVIES]: 'movie',
  [EPlexDataType.EPISODES]: 'episode',
  [EPlexDataType.SHOWS]: 'show',
  [EPlexDataType.SEASONS]: 'season',
} as const;

export const createCollection = (
  properties: Partial<Collection> = {},
): Collection => {
  return {
    id: faker.number.int(),
    title: faker.string.sample(10),
    description: '',
    isActive: true,
    arrAction: ServarrAction.DELETE,
    type: faker.helpers.arrayElement([
      EPlexDataType.MOVIES,
      EPlexDataType.EPISODES,
      EPlexDataType.SEASONS,
      EPlexDataType.SHOWS,
    ]),
    libraryId: faker.number.int(),
    plexId: faker.number.int(),
    addDate: faker.date.past(),
    collectionLog: [],
    collectionMedia: [],
    deleteAfterDays: 30,
    forceOverseerr: false,
    handledMediaAmount: 0,
    keepLogsForMonths: 6,
    lastDurationInSeconds: 0,
    manualCollection: false,
    manualCollectionName: undefined,
    radarrSettings: undefined,
    radarrSettingsId: undefined,
    sonarrSettings: undefined,
    sonarrSettingsId: undefined,
    listExclusions: false,
    ruleGroup: undefined,
    visibleOnHome: false,
    visibleOnRecommended: false,
    tautulliWatchedPercentOverride: undefined,
    ...properties,
  };
};

export const createCollectionMedia = (
  collectionOrType?: Collection | EPlexDataType,
  properties: Partial<CollectionMedia> = {},
): CollectionMedia => {
  const collectionToUse =
    collectionOrType instanceof Collection
      ? collectionOrType
      : createCollection({ type: collectionOrType });

  return {
    id: faker.number.int(),
    collection: collectionToUse,
    collectionId: collectionToUse.id,
    addDate: faker.date.past(),
    image_path: '',
    isManual: false,
    plexId: faker.number.int(),
    tmdbId: faker.number.int(),
    ...properties,
  };
};

type CollectionMediaWithPlexDataOptional = Omit<
  CollectionMediaWithPlexData,
  'plexData'
> & {
  plexData: Partial<Omit<PlexMetadata, 'type'>>;
};

export const createCollectionMediaWithPlexData = (
  collectionOrType?: Collection | EPlexDataType,
  properties: Partial<CollectionMediaWithPlexDataOptional> = {},
): CollectionMediaWithPlexData => {
  const collectionMedia: CollectionMedia = {
    ...createCollectionMedia(collectionOrType, properties),
    ...properties,
  };

  return {
    ...createCollectionMedia(collectionOrType, properties),
    ...properties,
    plexData: createPlexMetadata({
      ...properties.plexData,
      type: EPlexDataTypeToPlexTypeMap[collectionMedia.collection.type],
    }),
  };
};

export const createPlexMetadata = (
  properties: Partial<PlexMetadata> = {},
): PlexMetadata => {
  const type =
    properties.type ??
    faker.helpers.arrayElement(['movie', 'show', 'season', 'episode']);

  return {
    ratingKey: faker.string.sample(10),
    index: faker.number.int(),
    addedAt: faker.date.past().getTime(),
    updatedAt: faker.date.past().getTime(),
    title: faker.word.words(2),
    Guid: [
      {
        id: `tvdb://${faker.number.int()}`,
      },
      {
        id: `tmdb://${faker.number.int()}`,
      },
      {
        id: `imdb://tt${faker.number.int()}`,
      },
    ],
    guid: `plex://${type}/${faker.string.sample(24)}`,
    leafCount: ['show', 'season'].includes(type)
      ? faker.number.int()
      : undefined,
    originallyAvailableAt: faker.date.past().toISOString().split('T')[0],
    viewedLeafCount: ['show', 'season'].includes(type)
      ? faker.number.int()
      : undefined,
    Media: [],
    media: [],
    ...properties,
    type,
  };
};

export const createPlexLibraries = (
  properties: Partial<PlexLibrary> = {},
): PlexLibrary[] => {
  return [
    createPlexLibrary(properties),
    createPlexLibrary(),
    createPlexLibrary(),
  ];
};

export const createPlexLibrary = (
  properties: Partial<PlexLibrary> = {},
): PlexLibrary => ({
  agent: faker.string.sample(10),
  type: faker.helpers.arrayElement(['movie', 'show']),
  key: faker.string.sample(10),
  title: faker.string.sample(10),
  ...properties,
});

export const createPlexLibraryItem = (
  type?: PlexMetadata['type'],
  properties: Partial<PlexLibraryItem> = {},
): PlexLibraryItem => ({
  ratingKey: faker.string.sample(10),
  title: faker.string.sample(10),
  index: faker.number.int(),
  parentIndex:
    type == 'season' || type == 'episode' ? faker.number.int() : undefined,
  parentRatingKey:
    type == 'season' || type == 'episode' ? faker.string.sample(10) : undefined,
  parentGuid:
    type == 'season' || type == 'episode' ? faker.string.sample(10) : undefined,
  guid: faker.string.sample(10),
  grandparentRatingKey: type == 'episode' ? faker.string.sample(10) : undefined,
  grandparentGuid: type == 'episode' ? faker.string.sample(10) : undefined,
  addedAt: faker.date.past().getTime(),
  audienceRating: faker.number.float({ min: 0, max: 10 }),
  duration: faker.number.int(),
  lastViewedAt: faker.date.past().getTime(),
  librarySectionID: faker.number.int(),
  librarySectionKey: faker.string.sample(10),
  librarySectionTitle: faker.string.sample(10),
  originallyAvailableAt: faker.date.past().toISOString(),
  skipCount: faker.number.int(),
  summary: faker.string.sample(10),
  type:
    type ?? faker.helpers.arrayElement(['movie', 'show', 'season', 'episode']),
  Media: [],
  updatedAt: faker.date.past().getTime(),
  viewCount: faker.number.int(),
  year: faker.number.int(),
  ...properties,
});

export const createRadarrMovie = (
  properties: Partial<RadarrMovie> = {},
): RadarrMovie => ({
  title: faker.string.sample(10),
  originalLanguage: {
    id: 1,
    name: 'English',
  },
  downloaded: faker.datatype.boolean(),
  id: faker.number.int(),
  hasFile: faker.datatype.boolean(),
  monitored: faker.datatype.boolean(),
  added: faker.date.past().toISOString(),
  inCinemas: faker.date.past().toISOString(),
  physicalRelease: faker.date.past().toISOString(),
  digitalRelease: faker.date.past().toISOString(),
  folderName: faker.system.directoryPath(),
  isAvailable: faker.datatype.boolean(),
  imdbId: faker.string.sample(10),
  path: faker.system.directoryPath(),
  tmdbId: faker.number.int(),
  qualityProfileId: faker.number.int(),
  movieFile: createRadarrMovieFile(),
  ratings: {
    imdb: {
      votes: faker.number.int(),
      value: faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    tmdb: {
      votes: faker.number.int(),
      value: faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    metacritic: {
      votes: faker.number.int(),
      value: faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    rottenTomatoes: {
      votes: faker.number.int(),
      value: faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    trakt: {
      votes: faker.number.int(),
      value: faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
  },
  sizeOnDisk: faker.number.int(),
  tags: [],
  titleSlug: faker.string.sample(10),
  ...properties,
});

export const createRadarrMovieFile = (
  properties: Partial<RadarrMovieFile> = {},
): RadarrMovieFile => ({
  id: faker.number.int(),
  dateAdded: faker.date.past().toISOString(),
  path: faker.system.filePath(),
  qualityCutoffNotMet: faker.datatype.boolean(),
  size: faker.number.int(),
  quality: {
    quality: createRadarrQuality(),
  },
  mediaInfo: {
    audioBitrate: faker.number.int(),
    audioChannels: faker.helpers.arrayElement([1, 2, 5.1, 6, 8]),
    audioCodec: faker.helpers.arrayElement([
      'DTS-HD MA',
      'DTS',
      'AC3',
      'E-AC3',
      'AAC',
    ]),
    audioLanguages: faker.helpers.arrayElement(['eng', 'spa', 'fre']),
    audioStreamCount: faker.number.int(),
    videoBitDepth: faker.number.int(),
    resolution: faker.helpers.arrayElement([
      '1920xc1080',
      '1280x720',
      '3840x2160',
    ]),
    videoBitrate: faker.number.int(),
    runTime: faker.date.anytime().toISOString().split('T')[1].split('.')[0],
    videoCodec: faker.helpers.arrayElement(['AVC', 'HEVC', 'VP9', 'AV1']),
    scanType: faker.helpers.arrayElement(['Progressive', 'Interlaced']),
    subtitles: faker.helpers.arrayElements(['eng', 'spa', 'fre']).join('/'),
    videoFps: faker.helpers.arrayElement([24, 30, 60]),
  },
  ...properties,
});

export const createRadarrQuality = (
  properties: Partial<RadarrQuality> = {},
): RadarrQuality => ({
  id: faker.number.int(),
  name: faker.string.sample(10),
  modifier: 'remux',
  resolution: faker.helpers.arrayElement([720, 1080, 2160, 480, 360, 240]),
  source: faker.helpers.arrayElement(['bluray', 'tv', 'webdl', 'dvd']),
  ...properties,
});

export const createSonarrSeries = (
  properties: Partial<SonarrSeries> = {},
): SonarrSeries => {
  const title = faker.string.sample(10);

  return {
    title,
    originalLanguage: {
      id: 1,
      name: 'English',
    },
    id: faker.number.int(),
    monitored: faker.datatype.boolean(),
    added: faker.date.past().toISOString(),
    imdbId: faker.string.sample(10),
    path: faker.system.directoryPath(),
    tvdbId: faker.number.int(),
    qualityProfileId: faker.number.int(),
    ratings: {
      votes: faker.number.int(),
      value: faker.number.float({ min: 0, max: 10 }),
    },
    tags: [],
    titleSlug: faker.string.sample(10),
    sortTitle: title,
    status: faker.helpers.arrayElement(SonarrSeriesStatusTypes),
    overview: faker.string.sample(10),
    network: faker.string.sample(10),
    airTime: `${faker.number.int({ min: 0, max: 23 })}:${faker.number.int({
      min: 0,
      max: 59,
    })}`,
    images: [
      {
        coverType: 'poster',
        url: faker.system.filePath(),
      },
      {
        coverType: 'banner',
        url: faker.system.filePath(),
      },
    ],
    remotePoster: faker.internet.url(),
    seasons: [
      {
        seasonNumber: 0,
        monitored: faker.datatype.boolean(),
      },
      {
        seasonNumber: 1,
        monitored: faker.datatype.boolean(),
      },
      {
        seasonNumber: 2,
        monitored: faker.datatype.boolean(),
      },
    ],
    year: faker.number.int(),
    seasonFolder: faker.datatype.boolean(),
    useSceneNumbering: faker.datatype.boolean(),
    runtime: faker.number.int({ min: 0, max: 120 }),
    tvRageId: faker.number.int(),
    tvMazeId: faker.number.int(),
    firstAired: faker.date.past().toISOString(),
    seriesType: faker.helpers.arrayElement(SonarrSeriesTypes),
    cleanTitle: title.replace(/\s+/g, '-').toLowerCase(),
    certification: faker.string.sample(10),
    genres: [faker.string.sample(10), faker.string.sample(10)],
    ...properties,
  };
};

export const createSonarrEpisode = (
  properties: Partial<SonarrEpisode> = {},
): SonarrEpisode => ({
  id: faker.number.int(),
  seriesId: faker.number.int(),
  seasonNumber: faker.number.int(),
  episodeNumber: faker.number.int(),
  airDate: faker.date.past().toISOString().split('T')[0],
  airDateUtc: faker.date.past().toISOString(),
  hasFile: faker.datatype.boolean(),
  episodeFileId: faker.number.int(),
  monitored: faker.datatype.boolean(),
  ...properties,
});

export const createSonarrEpisodeFile = (
  properties: Partial<SonarrEpisodeFile> = {},
): SonarrEpisodeFile => ({
  id: faker.number.int(),
  seriesId: faker.number.int(),
  seasonNumber: faker.number.int(),
  dateAdded: faker.date.past(),
  path: faker.system.filePath(),
  relativePath: faker.system.filePath(),
  qualityCutoffNotMet: faker.datatype.boolean(),
  size: faker.number.int(),
  ...properties,
});

export const createRulesDto = (
  properties: Partial<RulesDto> = {},
): RulesDto => ({
  id: faker.number.int(),
  libraryId: faker.number.int(),
  dataType: faker.helpers.arrayElement([
    EPlexDataType.MOVIES,
    EPlexDataType.EPISODES,
    EPlexDataType.SEASONS,
    EPlexDataType.SHOWS,
  ]),
  name: faker.string.sample(10),
  rules: [],
  description: faker.string.sample(10),
  ...properties,
});
