import { faker } from '@faker-js/faker';
import {
  ArrDiskspaceResource,
  MediaItem,
  MediaItemType,
  MediaItemWithParent,
  MediaLibrary,
  MediaServerType,
} from '@maintainerr/contracts';
import { PlexCollection } from '../../src/modules/api/plex-api/interfaces/collection.interface';
import {
  PlexLibrary,
  PlexLibraryItem,
  PlexSeenBy,
  PlexUserAccount,
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
  CollectionMediaManualMembershipSource,
  CollectionMediaWithMetadata,
} from '../../src/modules/collections/entities/collection_media.entities';
import { ServarrAction } from '../../src/modules/collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../../src/modules/logging/logs.service';
import { MetadataLookupPolicy } from '../../src/modules/metadata/interfaces/metadata-lookup-policy.interface';
import { IMetadataProvider } from '../../src/modules/metadata/interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  ResolvedMediaIds,
} from '../../src/modules/metadata/interfaces/metadata.types';
import { RuleDto } from '../../src/modules/rules/dtos/rule.dto';
import { RulesDto } from '../../src/modules/rules/dtos/rules.dto';

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
      'movie',
      'episode',
      'season',
      'show',
    ] as MediaItemType[]),
    libraryId: faker.number.int().toString(),
    mediaServerId: faker.number.int().toString(),
    mediaServerType: MediaServerType.PLEX,
    addDate: faker.date.past(),
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

export const createCollectionMedia = (
  collectionOrType?: Collection | MediaItemType,
  properties: Partial<CollectionMedia> = {},
): CollectionMedia => {
  // Check if collectionOrType is a collection-like object (has an 'id' and 'type' property)
  const isCollection =
    collectionOrType !== null &&
    typeof collectionOrType === 'object' &&
    'id' in collectionOrType &&
    'type' in collectionOrType;

  const collectionToUse = isCollection
    ? (collectionOrType as Collection)
    : createCollection({ type: collectionOrType as MediaItemType });

  return Object.assign(new CollectionMedia(), {
    id: faker.number.int(),
    collection: collectionToUse,
    collectionId: collectionToUse.id,
    addDate: faker.date.past(),
    image_path: '',
    isManual: false,
    includedByRule: true,
    manualMembershipSource:
      null as CollectionMediaManualMembershipSource | null,
    mediaServerId: faker.number.int().toString(),
    tmdbId: faker.number.int(),
    sizeBytes: null,
    ...properties,
  });
};

type CollectionMediaWithMetadataOptional = Omit<
  CollectionMediaWithMetadata,
  'mediaData'
> & {
  mediaData: Partial<Omit<MediaItemWithParent, 'type'>>;
};

export const createCollectionMediaWithMetadata = (
  collectionOrType?: Collection | MediaItemType,
  properties: Partial<CollectionMediaWithMetadataOptional> = {},
): CollectionMediaWithMetadata => {
  const collectionMedia = Object.assign(
    new CollectionMedia(),
    createCollectionMedia(collectionOrType, properties),
    properties,
  );

  return Object.assign(new CollectionMediaWithMetadata(), {
    ...createCollectionMedia(collectionOrType, properties),
    ...properties,
    mediaData: createMediaItem({
      ...properties.mediaData,
      type: collectionMedia.collection.type,
    }),
  });
};

export const createMediaItem = (
  properties: Partial<MediaItem> = {},
): MediaItemWithParent => {
  const type =
    properties.type ??
    faker.helpers.arrayElement([
      'movie',
      'show',
      'season',
      'episode',
    ] as MediaItemType[]);

  return {
    id: faker.number.int().toString(),
    title: faker.word.words(2),
    guid: `plex://${type}/${faker.string.sample(24)}`,
    type,
    addedAt: faker.date.past(),
    updatedAt: faker.date.past(),
    providerIds: {
      tvdb: [faker.number.int().toString()],
      tmdb: [faker.number.int().toString()],
      imdb: [`tt${faker.number.int()}`],
    },
    mediaSources: [],
    library: {
      id: faker.number.int().toString(),
      title: faker.word.words(2),
    },
    index: faker.number.int(),
    parentIndex: type === 'episode' ? faker.number.int() : undefined,
    childCount:
      type === 'show' || type === 'season' ? faker.number.int() : undefined,
    watchedChildCount:
      type === 'show' || type === 'season' ? faker.number.int() : undefined,
    summary: faker.lorem.paragraph(),
    year: faker.number.int({ min: 1900, max: 2024 }),
    ...properties,
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

export const createPlexLibrary = (
  properties: Partial<PlexLibrary> = {},
): PlexLibrary => ({
  agent: faker.string.sample(10),
  type: faker.helpers.arrayElement(['movie', 'show']),
  key: faker.string.sample(10),
  title: faker.string.sample(10),
  ...properties,
});

export const createPlexUserAccount = (
  properties: Partial<PlexUserAccount> = {},
): PlexUserAccount => ({
  id: faker.number.int(),
  key: faker.string.sample(10),
  name: faker.string.sample(10),
  defaultAudioLanguage: 'en',
  autoSelectAudio: true,
  defaultSubtitleLanguage: 'en',
  subtitleMode: faker.number.int(),
  thumb: faker.system.filePath(),
  ...properties,
});

export const createPlexSeenBy = (
  properties: Partial<PlexSeenBy> = {},
): PlexSeenBy => ({
  ...createPlexLibraryItem('movie', properties),
  historyKey: faker.string.sample(10),
  key: faker.string.sample(10),
  ratingKey: properties.ratingKey ?? faker.string.sample(10),
  title: properties.title ?? faker.string.sample(10),
  thumb: faker.system.filePath(),
  originallyAvailableAt: faker.date.past().toISOString().split('T')[0],
  viewedAt: faker.date.past().getTime(),
  accountID: faker.number.int(),
  deviceID: faker.number.int(),
  ...properties,
});

export const createPlexCollection = (
  properties: Partial<PlexCollection> = {},
): PlexCollection => ({
  ratingKey: faker.string.sample(10),
  key: faker.string.sample(10),
  guid: faker.string.sample(10),
  type: 'collection',
  title: faker.string.sample(10),
  subtype: 'movie',
  summary: faker.string.sample(10),
  index: faker.number.int(),
  ratingCount: faker.number.int(),
  thumb: faker.system.filePath(),
  addedAt: faker.date.past().getTime(),
  updatedAt: faker.date.past().getTime(),
  childCount: faker.number.int().toString(),
  maxYear: faker.number.int().toString(),
  minYear: faker.number.int().toString(),
  ...properties,
});

/**
 * Create a MediaLibrary for testing (server-agnostic library representation)
 */
export const createMediaLibrary = (
  properties: Partial<MediaLibrary> = {},
): MediaLibrary => ({
  id: faker.string.sample(10),
  title: faker.string.sample(10),
  type: faker.helpers.arrayElement(['movie', 'show']),
  agent: faker.string.sample(10),
  ...properties,
});

/**
 * Create multiple MediaLibraries for testing
 */
export const createMediaLibraries = (
  properties: Partial<MediaLibrary> = {},
): MediaLibrary[] => {
  return [
    createMediaLibrary(properties),
    createMediaLibrary(),
    createMediaLibrary(),
  ];
};

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
  year: faker.number.int(),
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
    ...(properties.mediaInfo as any),
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
    videoBitrate: faker.number.int(),
    videoCodec: faker.helpers.arrayElement(['AVC', 'HEVC', 'VP9', 'AV1']),
    videoFps: faker.helpers.arrayElement([24, 30, 60]),
    resolution: faker.helpers.arrayElement([
      '1920x1080',
      '1280x720',
      '3840x2160',
    ]),
    runTime: faker.date.anytime().toISOString().split('T')[1].split('.')[0],
    scanType: faker.helpers.arrayElement(['Progressive', 'Interlaced']),
    subtitles: faker.helpers.arrayElements(['eng', 'spa', 'fre']).join('/'),
    ...(properties.mediaInfo as any),
  },
  ...properties,
});

export const createRulesDto = (
  properties: Partial<RulesDto> = {},
): RulesDto => ({
  id: faker.number.int(),
  libraryId: faker.number.int().toString(),
  dataType: faker.helpers.arrayElement([
    'movie',
    'episode',
    'season',
    'show',
  ] as MediaItemType[]),
  name: faker.string.sample(10),
  rules: [],
  description: faker.string.sample(10),
  ...properties,
});

export const createArrDiskspaceResource = (
  properties: Partial<ArrDiskspaceResource> = {},
): ArrDiskspaceResource => ({
  id: faker.number.int(),
  path: '/media',
  label: null,
  freeSpace: 0,
  totalSpace: 0,
  ...properties,
});

export const createRuleDto = (properties: Partial<RuleDto> = {}): RuleDto => ({
  operator: null,
  action: 0,
  firstVal: [0, 0],
  section: 0,
  ...properties,
});

/**
 * Create a mock MaintainerrLogger for use in tests that construct services manually.
 * Tests using @suites/unit TestBed get this automatically.
 */
export const createMockLogger = (): jest.Mocked<MaintainerrLogger> =>
  ({
    setContext: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }) as unknown as jest.Mocked<MaintainerrLogger>;

type MetadataDetailsFixture = Partial<Omit<MetadataDetails, 'externalIds'>> & {
  externalIds?: Partial<ResolvedMediaIds> & Pick<ResolvedMediaIds, 'type'>;
};

export interface MetadataProviderMockConfig {
  name: string;
  idKey: string;
  isAvailable?: boolean;
  details?: MetadataDetailsFixture;
  detailsId?: number;
  posterUrl?: string;
  backdropUrl?: string;
  findByExternalId?: (
    externalId: string | number,
    type: string,
  ) => Promise<ExternalIdSearchResult[] | undefined>;
}

export interface MetadataLookupServiceTestCase {
  title: string;
  service: string;
  lookupPolicy: MetadataLookupPolicy;
  libraryItem: Partial<MediaItem>;
  providerMocks: MetadataProviderMockConfig[];
  expectedCandidates: Array<{ providerKey: string; id: number }>;
}

export const createMetadataDetails = (
  properties: MetadataDetailsFixture = {},
): MetadataDetails => {
  const type = properties.type ?? properties.externalIds?.type ?? 'movie';

  return {
    id: faker.number.int(),
    title: 'Fixture Story',
    type,
    externalIds: {
      type,
      ...properties.externalIds,
    },
    ...properties,
  };
};

export const createMetadataProviderMock = ({
  name,
  idKey,
  isAvailable = true,
  details,
  detailsId,
  posterUrl,
  backdropUrl,
  findByExternalId,
}: MetadataProviderMockConfig): jest.Mocked<IMetadataProvider> => {
  const resolvedDetails = details
    ? createMetadataDetails({
        id: detailsId,
        ...details,
      })
    : undefined;

  return {
    name,
    idKey,
    isAvailable: jest.fn(() => isAvailable),
    extractId: jest.fn((ids) =>
      typeof ids[idKey] === 'number' ? (ids[idKey] as number) : undefined,
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
  } as unknown as jest.Mocked<IMetadataProvider>;
};

export const metadataLookupServiceTestCases: MetadataLookupServiceTestCase[] = [
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
