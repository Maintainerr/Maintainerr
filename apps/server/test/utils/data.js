'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.metadataLookupServiceTestCases =
  exports.createMetadataProviderMock =
  exports.createMetadataDetails =
  exports.createMockLogger =
  exports.createRuleDto =
  exports.createArrDiskspaceResource =
  exports.createRulesDto =
  exports.createSonarrEpisodeFile =
  exports.createSonarrEpisode =
  exports.createSonarrSeries =
  exports.createRadarrQuality =
  exports.createRadarrMovieFile =
  exports.createRadarrMovie =
  exports.createPlexLibraryItem =
  exports.createMediaLibraries =
  exports.createMediaLibrary =
  exports.createPlexCollection =
  exports.createPlexSeenBy =
  exports.createPlexUserAccount =
  exports.createPlexLibrary =
  exports.createPlexMetadata =
  exports.createMediaItem =
  exports.createCollectionMediaWithMetadata =
  exports.createCollectionMedia =
  exports.createCollection =
    void 0;
const faker_1 = require('@faker-js/faker');
const contracts_1 = require('@maintainerr/contracts');
const sonarr_interface_1 = require('../../src/modules/api/servarr-api/interfaces/sonarr.interface');
const collection_media_entities_1 = require('../../src/modules/collections/entities/collection_media.entities');
const collection_interface_1 = require('../../src/modules/collections/interfaces/collection.interface');
const createCollection = (properties = {}) => {
  return {
    id: faker_1.faker.number.int(),
    title: faker_1.faker.string.sample(10),
    description: '',
    isActive: true,
    arrAction: collection_interface_1.ServarrAction.DELETE,
    type: faker_1.faker.helpers.arrayElement([
      'movie',
      'episode',
      'season',
      'show',
    ]),
    libraryId: faker_1.faker.number.int().toString(),
    mediaServerId: faker_1.faker.number.int().toString(),
    mediaServerType: contracts_1.MediaServerType.PLEX,
    addDate: faker_1.faker.date.past(),
    collectionLog: [],
    collectionMedia: [],
    deleteAfterDays: 30,
    forceSeerr: false,
    handledMediaAmount: 0,
    keepLogsForMonths: 6,
    lastDurationInSeconds: 0,
    manualCollection: false,
    manualCollectionName: undefined,
    radarrSettings: undefined,
    radarrSettingsId: undefined,
    radarrQualityProfileId: undefined,
    sonarrSettings: undefined,
    sonarrSettingsId: undefined,
    sonarrQualityProfileId: undefined,
    listExclusions: false,
    ruleGroup: undefined,
    visibleOnHome: false,
    visibleOnRecommended: false,
    overlayEnabled: false,
    tautulliWatchedPercentOverride: undefined,
    sortTitle: undefined,
    totalSizeBytes: null,
    handledMediaSizeBytes: 0,
    overlayTemplateId: null,
    overlayTemplate: null,
    mediaServerSort: null,
    ...properties,
  };
};
exports.createCollection = createCollection;
const createCollectionMedia = (collectionOrType, properties = {}) => {
  const isCollection =
    collectionOrType !== null &&
    typeof collectionOrType === 'object' &&
    'id' in collectionOrType &&
    'type' in collectionOrType;
  const collectionToUse = isCollection
    ? collectionOrType
    : (0, exports.createCollection)({ type: collectionOrType });
  return Object.assign(new collection_media_entities_1.CollectionMedia(), {
    id: faker_1.faker.number.int(),
    collection: collectionToUse,
    collectionId: collectionToUse.id,
    addDate: faker_1.faker.date.past(),
    image_path: '',
    isManual: false,
    includedByRule: true,
    manualMembershipSource: null,
    ruleEvaluationFailed: false,
    mediaServerId: faker_1.faker.number.int().toString(),
    tmdbId: faker_1.faker.number.int(),
    sizeBytes: null,
    ...properties,
  });
};
exports.createCollectionMedia = createCollectionMedia;
const createCollectionMediaWithMetadata = (
  collectionOrType,
  properties = {},
) => {
  const collectionMedia = Object.assign(
    new collection_media_entities_1.CollectionMedia(),
    (0, exports.createCollectionMedia)(collectionOrType, properties),
    properties,
  );
  return Object.assign(
    new collection_media_entities_1.CollectionMediaWithMetadata(),
    {
      ...(0, exports.createCollectionMedia)(collectionOrType, properties),
      ...properties,
      mediaData: (0, exports.createMediaItem)({
        ...properties.mediaData,
        type: collectionMedia.collection.type,
      }),
    },
  );
};
exports.createCollectionMediaWithMetadata = createCollectionMediaWithMetadata;
const createMediaItem = (properties = {}) => {
  const type =
    properties.type ??
    faker_1.faker.helpers.arrayElement(['movie', 'show', 'season', 'episode']);
  return {
    id: faker_1.faker.number.int().toString(),
    title: faker_1.faker.word.words(2),
    guid: `plex://${type}/${faker_1.faker.string.sample(24)}`,
    type,
    addedAt: faker_1.faker.date.past(),
    updatedAt: faker_1.faker.date.past(),
    providerIds: {
      tvdb: [faker_1.faker.number.int().toString()],
      tmdb: [faker_1.faker.number.int().toString()],
      imdb: [`tt${faker_1.faker.number.int()}`],
    },
    mediaSources: [],
    library: {
      id: faker_1.faker.number.int().toString(),
      title: faker_1.faker.word.words(2),
    },
    index: faker_1.faker.number.int(),
    parentIndex: type === 'episode' ? faker_1.faker.number.int() : undefined,
    childCount:
      type === 'show' || type === 'season'
        ? faker_1.faker.number.int()
        : undefined,
    watchedChildCount:
      type === 'show' || type === 'season'
        ? faker_1.faker.number.int()
        : undefined,
    summary: faker_1.faker.lorem.paragraph(),
    year: faker_1.faker.number.int({ min: 1900, max: 2024 }),
    ...properties,
  };
};
exports.createMediaItem = createMediaItem;
const createPlexMetadata = (properties = {}) => {
  const type =
    properties.type ??
    faker_1.faker.helpers.arrayElement(['movie', 'show', 'season', 'episode']);
  return {
    ratingKey: faker_1.faker.string.sample(10),
    index: faker_1.faker.number.int(),
    addedAt: faker_1.faker.date.past().getTime(),
    updatedAt: faker_1.faker.date.past().getTime(),
    title: faker_1.faker.word.words(2),
    Guid: [
      {
        id: `tvdb://${faker_1.faker.number.int()}`,
      },
      {
        id: `tmdb://${faker_1.faker.number.int()}`,
      },
      {
        id: `imdb://tt${faker_1.faker.number.int()}`,
      },
    ],
    guid: `plex://${type}/${faker_1.faker.string.sample(24)}`,
    leafCount: ['show', 'season'].includes(type)
      ? faker_1.faker.number.int()
      : undefined,
    originallyAvailableAt: faker_1.faker.date
      .past()
      .toISOString()
      .split('T')[0],
    viewedLeafCount: ['show', 'season'].includes(type)
      ? faker_1.faker.number.int()
      : undefined,
    Media: [],
    media: [],
    ...properties,
    type,
  };
};
exports.createPlexMetadata = createPlexMetadata;
const createPlexLibrary = (properties = {}) => ({
  agent: faker_1.faker.string.sample(10),
  type: faker_1.faker.helpers.arrayElement(['movie', 'show']),
  key: faker_1.faker.string.sample(10),
  title: faker_1.faker.string.sample(10),
  ...properties,
});
exports.createPlexLibrary = createPlexLibrary;
const createPlexUserAccount = (properties = {}) => ({
  id: faker_1.faker.number.int(),
  key: faker_1.faker.string.sample(10),
  name: faker_1.faker.string.sample(10),
  defaultAudioLanguage: 'en',
  autoSelectAudio: true,
  defaultSubtitleLanguage: 'en',
  subtitleMode: faker_1.faker.number.int(),
  thumb: faker_1.faker.system.filePath(),
  ...properties,
});
exports.createPlexUserAccount = createPlexUserAccount;
const createPlexSeenBy = (properties = {}) => ({
  ...(0, exports.createPlexLibraryItem)('movie', properties),
  historyKey: faker_1.faker.string.sample(10),
  key: faker_1.faker.string.sample(10),
  ratingKey: properties.ratingKey ?? faker_1.faker.string.sample(10),
  title: properties.title ?? faker_1.faker.string.sample(10),
  thumb: faker_1.faker.system.filePath(),
  originallyAvailableAt: faker_1.faker.date.past().toISOString().split('T')[0],
  viewedAt: faker_1.faker.date.past().getTime(),
  accountID: faker_1.faker.number.int(),
  deviceID: faker_1.faker.number.int(),
  ...properties,
});
exports.createPlexSeenBy = createPlexSeenBy;
const createPlexCollection = (properties = {}) => ({
  ratingKey: faker_1.faker.string.sample(10),
  key: faker_1.faker.string.sample(10),
  guid: faker_1.faker.string.sample(10),
  type: 'collection',
  title: faker_1.faker.string.sample(10),
  subtype: 'movie',
  summary: faker_1.faker.string.sample(10),
  index: faker_1.faker.number.int(),
  ratingCount: faker_1.faker.number.int(),
  thumb: faker_1.faker.system.filePath(),
  addedAt: faker_1.faker.date.past().getTime(),
  updatedAt: faker_1.faker.date.past().getTime(),
  childCount: faker_1.faker.number.int().toString(),
  maxYear: faker_1.faker.number.int().toString(),
  minYear: faker_1.faker.number.int().toString(),
  ...properties,
});
exports.createPlexCollection = createPlexCollection;
const createMediaLibrary = (properties = {}) => ({
  id: faker_1.faker.string.sample(10),
  title: faker_1.faker.string.sample(10),
  type: faker_1.faker.helpers.arrayElement(['movie', 'show']),
  agent: faker_1.faker.string.sample(10),
  ...properties,
});
exports.createMediaLibrary = createMediaLibrary;
const createMediaLibraries = (properties = {}) => {
  return [
    (0, exports.createMediaLibrary)(properties),
    (0, exports.createMediaLibrary)(),
    (0, exports.createMediaLibrary)(),
  ];
};
exports.createMediaLibraries = createMediaLibraries;
const createPlexLibraryItem = (type, properties = {}) => ({
  ratingKey: faker_1.faker.string.sample(10),
  title: faker_1.faker.string.sample(10),
  index: faker_1.faker.number.int(),
  parentIndex:
    type == 'season' || type == 'episode'
      ? faker_1.faker.number.int()
      : undefined,
  parentRatingKey:
    type == 'season' || type == 'episode'
      ? faker_1.faker.string.sample(10)
      : undefined,
  parentGuid:
    type == 'season' || type == 'episode'
      ? faker_1.faker.string.sample(10)
      : undefined,
  guid: faker_1.faker.string.sample(10),
  grandparentRatingKey:
    type == 'episode' ? faker_1.faker.string.sample(10) : undefined,
  grandparentGuid:
    type == 'episode' ? faker_1.faker.string.sample(10) : undefined,
  addedAt: faker_1.faker.date.past().getTime(),
  audienceRating: faker_1.faker.number.float({ min: 0, max: 10 }),
  duration: faker_1.faker.number.int(),
  lastViewedAt: faker_1.faker.date.past().getTime(),
  librarySectionID: faker_1.faker.number.int(),
  librarySectionKey: faker_1.faker.string.sample(10),
  librarySectionTitle: faker_1.faker.string.sample(10),
  originallyAvailableAt: faker_1.faker.date.past().toISOString(),
  skipCount: faker_1.faker.number.int(),
  summary: faker_1.faker.string.sample(10),
  type:
    type ??
    faker_1.faker.helpers.arrayElement(['movie', 'show', 'season', 'episode']),
  Media: [],
  updatedAt: faker_1.faker.date.past().getTime(),
  viewCount: faker_1.faker.number.int(),
  year: faker_1.faker.number.int(),
  ...properties,
});
exports.createPlexLibraryItem = createPlexLibraryItem;
const createRadarrMovie = (properties = {}) => ({
  title: faker_1.faker.string.sample(10),
  originalLanguage: {
    id: 1,
    name: 'English',
  },
  downloaded: faker_1.faker.datatype.boolean(),
  id: faker_1.faker.number.int(),
  hasFile: faker_1.faker.datatype.boolean(),
  monitored: faker_1.faker.datatype.boolean(),
  added: faker_1.faker.date.past().toISOString(),
  inCinemas: faker_1.faker.date.past().toISOString(),
  physicalRelease: faker_1.faker.date.past().toISOString(),
  digitalRelease: faker_1.faker.date.past().toISOString(),
  folderName: faker_1.faker.system.directoryPath(),
  isAvailable: faker_1.faker.datatype.boolean(),
  imdbId: faker_1.faker.string.sample(10),
  path: faker_1.faker.system.directoryPath(),
  tmdbId: faker_1.faker.number.int(),
  qualityProfileId: faker_1.faker.number.int(),
  movieFile: (0, exports.createRadarrMovieFile)(),
  ratings: {
    imdb: {
      votes: faker_1.faker.number.int(),
      value: faker_1.faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    tmdb: {
      votes: faker_1.faker.number.int(),
      value: faker_1.faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    metacritic: {
      votes: faker_1.faker.number.int(),
      value: faker_1.faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    rottenTomatoes: {
      votes: faker_1.faker.number.int(),
      value: faker_1.faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
    trakt: {
      votes: faker_1.faker.number.int(),
      value: faker_1.faker.number.float({ min: 0, max: 10 }),
      type: 'user',
    },
  },
  sizeOnDisk: faker_1.faker.number.int(),
  tags: [],
  titleSlug: faker_1.faker.string.sample(10),
  year: faker_1.faker.number.int(),
  ...properties,
});
exports.createRadarrMovie = createRadarrMovie;
const createRadarrMovieFile = (properties = {}) => ({
  id: faker_1.faker.number.int(),
  dateAdded: faker_1.faker.date.past().toISOString(),
  path: faker_1.faker.system.filePath(),
  qualityCutoffNotMet: faker_1.faker.datatype.boolean(),
  size: faker_1.faker.number.int(),
  quality: {
    quality: (0, exports.createRadarrQuality)(),
  },
  mediaInfo: {
    audioBitrate: faker_1.faker.number.int(),
    audioChannels: faker_1.faker.helpers.arrayElement([1, 2, 5.1, 6, 8]),
    audioCodec: faker_1.faker.helpers.arrayElement([
      'DTS-HD MA',
      'DTS',
      'AC3',
      'E-AC3',
      'AAC',
    ]),
    audioLanguages: faker_1.faker.helpers.arrayElement(['eng', 'spa', 'fre']),
    audioStreamCount: faker_1.faker.number.int(),
    videoBitDepth: faker_1.faker.number.int(),
    resolution: faker_1.faker.helpers.arrayElement([
      '1920xc1080',
      '1280x720',
      '3840x2160',
    ]),
    videoBitrate: faker_1.faker.number.int(),
    runTime: faker_1.faker.date
      .anytime()
      .toISOString()
      .split('T')[1]
      .split('.')[0],
    videoCodec: faker_1.faker.helpers.arrayElement([
      'AVC',
      'HEVC',
      'VP9',
      'AV1',
    ]),
    scanType: faker_1.faker.helpers.arrayElement(['Progressive', 'Interlaced']),
    subtitles: faker_1.faker.helpers
      .arrayElements(['eng', 'spa', 'fre'])
      .join('/'),
    videoFps: faker_1.faker.helpers.arrayElement([24, 30, 60]),
    ...properties.mediaInfo,
  },
  ...properties,
});
exports.createRadarrMovieFile = createRadarrMovieFile;
const createRadarrQuality = (properties = {}) => ({
  id: faker_1.faker.number.int(),
  name: faker_1.faker.string.sample(10),
  modifier: 'remux',
  resolution: faker_1.faker.helpers.arrayElement([
    720, 1080, 2160, 480, 360, 240,
  ]),
  source: faker_1.faker.helpers.arrayElement(['bluray', 'tv', 'webdl', 'dvd']),
  ...properties,
});
exports.createRadarrQuality = createRadarrQuality;
const createSonarrSeries = (properties = {}) => {
  const title = faker_1.faker.string.sample(10);
  return {
    title,
    originalLanguage: {
      id: 1,
      name: 'English',
    },
    id: faker_1.faker.number.int(),
    monitored: faker_1.faker.datatype.boolean(),
    added: faker_1.faker.date.past().toISOString(),
    imdbId: faker_1.faker.string.sample(10),
    path: faker_1.faker.system.directoryPath(),
    tvdbId: faker_1.faker.number.int(),
    qualityProfileId: faker_1.faker.number.int(),
    ratings: {
      votes: faker_1.faker.number.int(),
      value: faker_1.faker.number.float({ min: 0, max: 10 }),
    },
    tags: [],
    titleSlug: faker_1.faker.string.sample(10),
    sortTitle: title,
    status: faker_1.faker.helpers.arrayElement(
      sonarr_interface_1.SonarrSeriesStatusTypes,
    ),
    overview: faker_1.faker.string.sample(10),
    network: faker_1.faker.string.sample(10),
    airTime: `${faker_1.faker.number.int({ min: 0, max: 23 })}:${faker_1.faker.number.int(
      {
        min: 0,
        max: 59,
      },
    )}`,
    images: [
      {
        coverType: 'poster',
        url: faker_1.faker.system.filePath(),
      },
      {
        coverType: 'banner',
        url: faker_1.faker.system.filePath(),
      },
    ],
    remotePoster: faker_1.faker.internet.url(),
    seasons: [
      {
        seasonNumber: 0,
        monitored: faker_1.faker.datatype.boolean(),
      },
      {
        seasonNumber: 1,
        monitored: faker_1.faker.datatype.boolean(),
      },
      {
        seasonNumber: 2,
        monitored: faker_1.faker.datatype.boolean(),
      },
    ],
    year: faker_1.faker.number.int(),
    seasonFolder: faker_1.faker.datatype.boolean(),
    useSceneNumbering: faker_1.faker.datatype.boolean(),
    runtime: faker_1.faker.number.int({ min: 0, max: 120 }),
    tvRageId: faker_1.faker.number.int(),
    tvMazeId: faker_1.faker.number.int(),
    firstAired: faker_1.faker.date.past().toISOString(),
    seriesType: faker_1.faker.helpers.arrayElement(
      sonarr_interface_1.SonarrSeriesTypes,
    ),
    cleanTitle: title.replace(/\s+/g, '-').toLowerCase(),
    certification: faker_1.faker.string.sample(10),
    genres: [faker_1.faker.string.sample(10), faker_1.faker.string.sample(10)],
    ...properties,
  };
};
exports.createSonarrSeries = createSonarrSeries;
const createSonarrEpisode = (properties = {}) => ({
  id: faker_1.faker.number.int(),
  seriesId: faker_1.faker.number.int(),
  seasonNumber: faker_1.faker.number.int(),
  episodeNumber: faker_1.faker.number.int(),
  airDate: faker_1.faker.date.past().toISOString().split('T')[0],
  airDateUtc: faker_1.faker.date.past().toISOString(),
  hasFile: faker_1.faker.datatype.boolean(),
  episodeFileId: faker_1.faker.number.int(),
  monitored: faker_1.faker.datatype.boolean(),
  ...properties,
});
exports.createSonarrEpisode = createSonarrEpisode;
const createSonarrEpisodeFile = (properties = {}) => ({
  id: faker_1.faker.number.int(),
  seriesId: faker_1.faker.number.int(),
  seasonNumber: faker_1.faker.number.int(),
  dateAdded: faker_1.faker.date.past(),
  path: faker_1.faker.system.filePath(),
  relativePath: faker_1.faker.system.filePath(),
  qualityCutoffNotMet: faker_1.faker.datatype.boolean(),
  size: faker_1.faker.number.int(),
  mediaInfo: {
    audioBitrate: faker_1.faker.number.int(),
    audioChannels: faker_1.faker.helpers.arrayElement([1, 2, 5.1, 6, 8]),
    audioCodec: faker_1.faker.helpers.arrayElement([
      'DTS-HD MA',
      'DTS',
      'AC3',
      'E-AC3',
      'AAC',
    ]),
    audioLanguages: faker_1.faker.helpers.arrayElement(['eng', 'spa', 'fre']),
    audioStreamCount: faker_1.faker.number.int(),
    videoBitDepth: faker_1.faker.number.int(),
    videoBitrate: faker_1.faker.number.int(),
    videoCodec: faker_1.faker.helpers.arrayElement([
      'AVC',
      'HEVC',
      'VP9',
      'AV1',
    ]),
    videoFps: faker_1.faker.helpers.arrayElement([24, 30, 60]),
    resolution: faker_1.faker.helpers.arrayElement([
      '1920x1080',
      '1280x720',
      '3840x2160',
    ]),
    runTime: faker_1.faker.date
      .anytime()
      .toISOString()
      .split('T')[1]
      .split('.')[0],
    scanType: faker_1.faker.helpers.arrayElement(['Progressive', 'Interlaced']),
    subtitles: faker_1.faker.helpers
      .arrayElements(['eng', 'spa', 'fre'])
      .join('/'),
    ...properties.mediaInfo,
  },
  ...properties,
});
exports.createSonarrEpisodeFile = createSonarrEpisodeFile;
const createRulesDto = (properties = {}) => ({
  id: faker_1.faker.number.int(),
  libraryId: faker_1.faker.number.int().toString(),
  dataType: faker_1.faker.helpers.arrayElement([
    'movie',
    'episode',
    'season',
    'show',
  ]),
  name: faker_1.faker.string.sample(10),
  rules: [],
  description: faker_1.faker.string.sample(10),
  ...properties,
});
exports.createRulesDto = createRulesDto;
const createArrDiskspaceResource = (properties = {}) => ({
  id: faker_1.faker.number.int(),
  path: '/media',
  label: null,
  freeSpace: 0,
  totalSpace: 0,
  ...properties,
});
exports.createArrDiskspaceResource = createArrDiskspaceResource;
const createRuleDto = (properties = {}) => ({
  operator: null,
  action: 0,
  firstVal: [0, 0],
  section: 0,
  ...properties,
});
exports.createRuleDto = createRuleDto;
const createMockLogger = () => ({
  setContext: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});
exports.createMockLogger = createMockLogger;
const createMetadataDetails = (properties = {}) => {
  const type = properties.type ?? properties.externalIds?.type ?? 'movie';
  return {
    id: faker_1.faker.number.int(),
    title: 'Fixture Story',
    type,
    externalIds: {
      type,
      ...properties.externalIds,
    },
    ...properties,
  };
};
exports.createMetadataDetails = createMetadataDetails;
const createMetadataProviderMock = ({
  name,
  idKey,
  isAvailable = true,
  details,
  detailsId,
  posterUrl,
  backdropUrl,
  findByExternalId,
}) => {
  const resolvedDetails = details
    ? (0, exports.createMetadataDetails)({
        id: detailsId,
        ...details,
      })
    : undefined;
  return {
    name,
    idKey,
    isAvailable: jest.fn(() => isAvailable),
    extractId: jest.fn((ids) =>
      typeof ids[idKey] === 'number' ? ids[idKey] : undefined,
    ),
    assignId: jest.fn((ids, id) => {
      ids[idKey] = id;
    }),
    getDetails: jest.fn().mockResolvedValue(resolvedDetails),
    getPosterUrl: jest
      .fn()
      .mockResolvedValue(posterUrl ?? `https://${idKey}/poster.jpg`),
    getBackdropUrl: jest
      .fn()
      .mockResolvedValue(backdropUrl ?? `https://${idKey}/backdrop.jpg`),
    getPersonDetails: jest.fn(),
    findByExternalId: jest
      .fn()
      .mockImplementation(findByExternalId ?? (async () => undefined)),
  };
};
exports.createMetadataProviderMock = createMetadataProviderMock;
exports.metadataLookupServiceTestCases = [
  {
    title:
      'resolves a Sonarr TVDB lookup candidate from TMDB provider details when TVDB is not directly available',
    service: 'sonarr',
    lookupPolicy: {
      providerKeys: ['tvdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'show-1',
      type: 'show',
      title: 'Fixture Story',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
        details: {
          title: 'Fixture Story',
          type: 'tv',
          externalIds: {
            tmdb: 771,
            tvdb: 202,
            type: 'tv',
          },
        },
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
      },
    ],
    expectedCandidates: [{ providerKey: 'tvdb', id: 202 }],
  },
  {
    title:
      'resolves a Radarr TMDB lookup candidate from TVDB provider details because Radarr prefers TMDB',
    service: 'radarr',
    lookupPolicy: {
      providerKeys: ['tmdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'movie-1',
      type: 'movie',
      title: 'Fixture Story',
      providerIds: {
        tmdb: [],
        imdb: [],
        tvdb: ['202'],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
        detailsId: 202,
        details: {
          title: 'Fixture Story',
          type: 'movie',
          externalIds: {
            tmdb: 771,
            tvdb: 202,
            type: 'movie',
          },
        },
      },
    ],
    expectedCandidates: [{ providerKey: 'tmdb', id: 771 }],
  },
  {
    title:
      'resolves a Seerr TMDB lookup candidate from TVDB provider details because Seerr prefers TMDB',
    service: 'seerr',
    lookupPolicy: {
      providerKeys: ['tmdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'show-2',
      type: 'show',
      title: 'Fixture Story',
      providerIds: {
        tmdb: [],
        imdb: [],
        tvdb: ['303'],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
        detailsId: 303,
        details: {
          title: 'Fixture Story',
          type: 'tv',
          externalIds: {
            tmdb: 404,
            tvdb: 303,
            type: 'tv',
          },
        },
      },
    ],
    expectedCandidates: [{ providerKey: 'tmdb', id: 404 }],
  },
  {
    title:
      'resolves a Radarr TMDB lookup candidate from a direct TVDB id when the TVDB provider is unavailable',
    service: 'radarr',
    lookupPolicy: {
      providerKeys: ['tmdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'movie-2',
      type: 'movie',
      title: 'Fixture Story',
      providerIds: {
        tmdb: [],
        imdb: [],
        tvdb: ['303'],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
        findByExternalId: async (externalId, type) => {
          if (type === 'tvdb' && externalId === 303) {
            return [{ movieId: 404 }];
          }
          return undefined;
        },
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
        isAvailable: false,
      },
    ],
    expectedCandidates: [{ providerKey: 'tmdb', id: 404 }],
  },
  {
    title:
      'resolves a Sonarr TVDB lookup candidate via TMDB cross-reference when TVDB provider is unavailable',
    service: 'sonarr',
    lookupPolicy: {
      providerKeys: ['tvdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'show-3',
      type: 'show',
      title: 'Fixture Story',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
        details: {
          title: 'Fixture Story',
          type: 'tv',
          externalIds: {
            tmdb: 771,
            tvdb: 505,
            type: 'tv',
          },
        },
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
        isAvailable: false,
      },
    ],
    expectedCandidates: [{ providerKey: 'tvdb', id: 505 }],
  },
  {
    title:
      'returns no Sonarr lookup candidates when TVDB remains unresolved while the TVDB provider is unavailable',
    service: 'sonarr',
    lookupPolicy: {
      providerKeys: ['tvdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'show-3b',
      type: 'show',
      title: 'Fixture Story',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: [],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
        details: {
          title: 'Fixture Story',
          type: 'tv',
          externalIds: {
            tmdb: 771,
            type: 'tv',
          },
        },
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
        isAvailable: false,
      },
    ],
    expectedCandidates: [],
  },
  {
    title:
      'resolves candidates directly when both TMDB and TVDB IDs are available on the library item',
    service: 'sonarr',
    lookupPolicy: {
      providerKeys: ['tvdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'show-4',
      type: 'show',
      title: 'Fixture Story',
      providerIds: {
        tmdb: ['771'],
        imdb: [],
        tvdb: ['202'],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
        details: {
          title: 'Fixture Story',
          type: 'tv',
          externalIds: {
            tmdb: 771,
            tvdb: 202,
            type: 'tv',
          },
        },
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
      },
    ],
    expectedCandidates: [{ providerKey: 'tvdb', id: 202 }],
  },
  {
    title:
      'returns empty candidates when no provider can resolve the required IDs',
    service: 'sonarr',
    lookupPolicy: {
      providerKeys: ['tvdb'],
      providerMatchMode: 'any',
    },
    libraryItem: {
      id: 'show-5',
      type: 'show',
      title: 'Unknown Show',
      providerIds: {
        tmdb: [],
        imdb: [],
        tvdb: [],
      },
    },
    providerMocks: [
      {
        name: 'TMDB',
        idKey: 'tmdb',
      },
      {
        name: 'TVDB',
        idKey: 'tvdb',
      },
    ],
    expectedCandidates: [],
  },
];
//# sourceMappingURL=data.js.map
