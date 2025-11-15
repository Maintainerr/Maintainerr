import z from 'zod'
import { EPlexDataType } from '../plex'

export enum RulePossibility {
  BIGGER,
  SMALLER,
  EQUALS,
  NOT_EQUALS,
  CONTAINS,
  BEFORE,
  AFTER,
  IN_LAST,
  IN_NEXT,
  NOT_CONTAINS,
  CONTAINS_PARTIAL,
  NOT_CONTAINS_PARTIAL,
  CONTAINS_ALL,
  NOT_CONTAINS_ALL,
  COUNT_EQUALS,
  COUNT_NOT_EQUALS,
  COUNT_BIGGER,
  COUNT_SMALLER,
}

export enum RuleTypes {
  NUMBER,
  DATE,
  TEXT,
  BOOL,
  TEXT_LIST,
}

export enum RuleOperators {
  AND,
  OR,
}

export enum Application {
  PLEX,
  RADARR,
  SONARR,
  OVERSEERR,
  TAUTULLI,
  JELLYSEERR,
}

export enum ArrAction {
  DELETE,
  UNMONITOR, // this also deletes
  SW_UNMONITOR_EXISTING_SEASONS,
  UNMONITOR_NO_DELETE,
}

export enum MediaType {
  BOTH,
  MOVIE,
  SHOW,
}

export class RuleType {
  static readonly NUMBER = new RuleType(
    '0',
    [
      RulePossibility.BIGGER,
      RulePossibility.SMALLER,
      RulePossibility.EQUALS,
      RulePossibility.NOT_EQUALS,
    ],
    'number',
  )
  static readonly DATE = new RuleType(
    '1',
    [
      RulePossibility.EQUALS,
      RulePossibility.NOT_EQUALS,
      RulePossibility.BEFORE,
      RulePossibility.AFTER,
      RulePossibility.IN_LAST,
      RulePossibility.IN_NEXT,
    ],
    'date',
  )
  static readonly TEXT = new RuleType(
    '2',
    [
      RulePossibility.EQUALS,
      RulePossibility.NOT_EQUALS,
      RulePossibility.CONTAINS,
      RulePossibility.NOT_CONTAINS,
    ],
    'text',
  )
  static readonly BOOL = new RuleType(
    '3',
    [RulePossibility.EQUALS, RulePossibility.NOT_EQUALS],
    'boolean',
  )
  static readonly TEXT_LIST = new RuleType(
    '4',
    [
      RulePossibility.EQUALS,
      RulePossibility.NOT_EQUALS,
      RulePossibility.CONTAINS,
      RulePossibility.NOT_CONTAINS,
      RulePossibility.CONTAINS_PARTIAL,
      RulePossibility.NOT_CONTAINS_PARTIAL,
      RulePossibility.COUNT_EQUALS,
      RulePossibility.COUNT_NOT_EQUALS,
      RulePossibility.COUNT_BIGGER,
      RulePossibility.COUNT_SMALLER,
    ],
    'text list',
  )
  public constructor(
    private readonly key: string,
    public readonly possibilities: number[],
    public readonly humanName: string,
  ) {}
  toString() {
    return this.key
  }
}

export type RuleValueType =
  | number
  | Date
  | string
  | boolean
  | number[]
  | string[]
  | null

export interface Property {
  id: number
  name: string
  type: RuleType
  mediaType: MediaType
  humanName: string
  cacheReset?: boolean // for properties that require a cache reset between group executions
  showType?: EPlexDataType[] // if not configured = available for all types
}

export interface ApplicationProperties {
  id: number
  name: string
  mediaType: MediaType
  props: Property[]
}

export class RuleConstants {
  applications: ApplicationProperties[] = [
    {
      id: Application.PLEX,
      name: 'Plex',
      mediaType: MediaType.BOTH,
      props: [
        {
          id: 0,
          name: 'addDate',
          humanName: 'Date added',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 1,
          name: 'seenBy',
          humanName: '[list] Viewed by (username)',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT_LIST, // returns usernames []
        },
        {
          id: 2,
          name: 'releaseDate',
          humanName: 'Release date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 3,
          name: 'rating_user',
          humanName: 'User rating (scale 1-10)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
        },
        {
          id: 4,
          name: 'people',
          humanName: '[list] People involved',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT_LIST, // return text[]
        },
        {
          id: 5,
          name: 'viewCount',
          humanName: 'Times viewed',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 6,
          name: 'collections',
          humanName: 'Present in amount of other collections',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
          cacheReset: true,
        },
        {
          id: 7,
          name: 'lastViewedAt',
          humanName: 'Last view date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 8,
          name: 'fileVideoResolution',
          humanName: 'Media file resolution (4k, 1080,..)',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT,
        },
        {
          id: 9,
          name: 'fileBitrate',
          humanName: 'Media file bitrate',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 10,
          name: 'fileVideoCodec',
          humanName: 'Media file codec',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT,
        },
        {
          id: 11,
          name: 'genre',
          humanName: '[list] List of genres (Action, Adventure,..)',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT_LIST, // return text[]
        },
        {
          id: 12,
          name: 'sw_allEpisodesSeenBy',
          humanName: '[list] Users that saw all available episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT_LIST, // return usernames []
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 13,
          name: 'sw_lastWatched',
          humanName: 'Newest episode view date',
          mediaType: MediaType.SHOW,
          type: RuleType.DATE,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 14,
          name: 'sw_episodes',
          humanName: 'Amount of available episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 15,
          name: 'sw_viewedEpisodes',
          humanName: 'Amount of watched episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 16,
          name: 'sw_lastEpisodeAddedAt',
          humanName: 'Last episode added at',
          mediaType: MediaType.SHOW,
          type: RuleType.DATE,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 17,
          name: 'sw_amountOfViews',
          humanName: 'Total views',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
        },
        {
          id: 18,
          name: 'sw_watchers',
          humanName: '[list] Users that watch the show/season/episode',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT_LIST, // return usernames []
          showType: [
            EPlexDataType.SHOWS,
            EPlexDataType.SEASONS,
            EPlexDataType.EPISODES,
          ],
        },
        {
          id: 19,
          name: 'collection_names',
          humanName: '[list] Collections media is present in (titles)',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT_LIST,
          cacheReset: true,
        },
        {
          id: 20,
          name: 'playlists',
          humanName: 'Present in amount of playlists',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
        },
        {
          id: 21,
          name: 'playlist_names',
          humanName: '[list] Playlists media is present in (titles)',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT_LIST,
        },
        {
          id: 22,
          name: 'rating_critics',
          humanName: 'Critics rating (scale 1-10)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
        },
        {
          id: 23,
          name: 'rating_audience',
          humanName: 'Audience rating (scale 1-10)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
        },
        {
          id: 24,
          name: 'labels',
          humanName: '[list] Labels',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT_LIST,
        },
        {
          id: 25,
          name: 'sw_collections_including_parent',
          humanName: 'Present in amount of other collections (incl. parents)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
          cacheReset: true,
        },
        {
          id: 26,
          name: 'sw_collection_names_including_parent',
          humanName:
            '[list] Collections media is present in (titles) (incl. parents)',
          mediaType: MediaType.SHOW,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
          cacheReset: true,
          type: RuleType.TEXT_LIST,
        },
        {
          id: 27,
          name: 'sw_lastEpisodeAiredAt',
          humanName: 'Last episode aired at',
          mediaType: MediaType.SHOW,
          type: RuleType.DATE,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 28,
          name: 'watchlist_isListedByUsers',
          humanName: '[list] Watchlisted by (username) [experimental]',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT_LIST,
        },
        {
          id: 30,
          name: 'watchlist_isWatchlisted',
          humanName: 'Is Watchlisted',
          mediaType: MediaType.BOTH,
          type: RuleType.BOOL,
        },
        {
          id: 29,
          name: 'sw_seasonLastEpisodeAiredAt',
          humanName: 'Last episode aired at (season)',
          mediaType: MediaType.SHOW,
          type: RuleType.DATE,
          showType: [EPlexDataType.EPISODES],
        },
        {
          id: 31,
          name: 'rating_imdb',
          humanName: 'IMDb rating (scale 1-10)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.EPISODES, EPlexDataType.SHOWS],
        },
        {
          id: 35,
          name: 'rating_imdbShow',
          humanName: 'IMDb rating (show) (scale 1-10)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
        },
        {
          id: 32,
          name: 'rating_rottenTomatoesCritic',
          humanName: 'Rotten Tomatoes critic rating (scale 1-10)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.EPISODES, EPlexDataType.SHOWS],
        },
        {
          id: 36,
          name: 'rating_rottenTomatoesCriticShow',
          humanName: 'Rotten Tomatoes critic rating (show) (scale 1-10)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
        },
        {
          id: 33,
          name: 'rating_rottenTomatoesAudience',
          humanName: 'Rotten Tomatoes audience rating (scale 1-10)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.EPISODES, EPlexDataType.SHOWS],
        },
        {
          id: 37,
          name: 'rating_rottenTomatoesAudienceShow',
          humanName: 'Rotten Tomatoes audience rating (show) (scale 1-10)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
        },
        {
          id: 34,
          name: 'rating_tmdb',
          humanName: 'The Movie Database rating (scale 1-10)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.EPISODES, EPlexDataType.SHOWS],
        },
        {
          id: 38,
          name: 'rating_tmdbShow',
          humanName: 'The Movie Database rating (show) (scale 1-10)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
        },
        {
          id: 39,
          name: 'collectionsIncludingSmart',
          humanName:
            'Present in amount of other collections (incl. smart collections)',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
          cacheReset: true,
        },
        {
          id: 40,
          name: 'sw_collections_including_parent_and_smart',
          humanName:
            'Present in amount of other collections (incl. parents and smart collections)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
          cacheReset: true,
        },
        {
          id: 41,
          name: 'sw_collection_names_including_parent_and_smart',
          humanName:
            '[list] Collections media is present in (titles) (incl. parents and smart collections)',
          mediaType: MediaType.SHOW,
          showType: [EPlexDataType.SEASONS, EPlexDataType.EPISODES],
          cacheReset: true,
          type: RuleType.TEXT_LIST,
        },
        {
          id: 42,
          name: 'collection_names_including_smart',
          humanName:
            '[list] Collections media is present in (titles) (incl. smart collections)',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT_LIST,
          cacheReset: true,
        },
      ],
    },
    {
      id: Application.RADARR,
      name: 'Radarr',
      mediaType: MediaType.MOVIE,
      props: [
        {
          id: 0,
          name: 'addDate',
          humanName: 'Date added',
          mediaType: MediaType.MOVIE,
          type: RuleType.DATE,
        },
        // Don't use ID 1, It was once used for an old rule value. Changing the id's messes up existing rules.
        {
          id: 2,
          name: 'tags',
          humanName: '[list] Tags',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT_LIST, // return text[]
        },
        {
          id: 3,
          name: 'profile',
          humanName: 'Quality profile',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT,
        }, // TODO
        {
          id: 4,
          name: 'releaseDate',
          humanName: 'Release date',
          mediaType: MediaType.MOVIE,
          type: RuleType.DATE,
        },
        {
          id: 5,
          name: 'monitored',
          humanName: 'is monitored',
          mediaType: MediaType.MOVIE,
          type: RuleType.BOOL,
        },
        {
          id: 6,
          name: 'inCinemas',
          humanName: 'In cinemas date',
          mediaType: MediaType.MOVIE,
          type: RuleType.DATE,
        },
        {
          id: 7,
          name: 'fileSize',
          humanName: 'File - size in MB',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 8,
          name: 'fileAudioChannels',
          humanName: 'File - audio channels',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 9,
          name: 'fileQuality',
          humanName: 'File - quality (2160, 1080,..)',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 10,
          name: 'fileDate',
          humanName: 'File - download date',
          mediaType: MediaType.MOVIE,
          type: RuleType.DATE,
        },
        {
          id: 11,
          name: 'runTime',
          humanName: 'File - runtime in minutes',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 12,
          name: 'filePath',
          humanName: 'File - file path',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT,
        },
        {
          id: 13,
          name: 'originalLanguage',
          humanName: 'Original language',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT,
        },
        {
          id: 14,
          name: 'rottenTomatoesRating',
          humanName: 'Rotten Tomatoes rating (scale 0-100)',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 17,
          name: 'rottenTomatoesRatingVotes',
          humanName: 'Rotten Tomatoes rating vote count',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 15,
          name: 'traktRating',
          humanName: 'Trakt rating (scale 0-10)',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 18,
          name: 'traktRatingVotes',
          humanName: 'Trakt rating vote count',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 16,
          name: 'imdbRating',
          humanName: 'IMDb rating (scale 0-10)',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 19,
          name: 'imdbRatingVotes',
          humanName: 'IMDb rating vote count',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
      ],
    },
    {
      id: Application.SONARR,
      name: 'Sonarr',
      mediaType: MediaType.SHOW,
      props: [
        {
          id: 0,
          name: 'addDate',
          humanName: 'Date added',
          mediaType: MediaType.SHOW,
          type: RuleType.DATE,
          showType: [EPlexDataType.SHOWS],
        },
        {
          id: 1,
          name: 'diskSizeEntireShow',
          humanName: 'Files - Disk size in MB ',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [
            EPlexDataType.SHOWS,
            EPlexDataType.SEASONS,
            EPlexDataType.EPISODES,
          ],
        },
        {
          id: 2,
          name: 'tags',
          humanName: '[list] Tags (show)',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT_LIST, // return text[]
        },
        {
          id: 3,
          name: 'qualityProfileId',
          humanName: 'Quality profile ID',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
        },
        {
          id: 4,
          name: 'firstAirDate',
          humanName: 'First air date',
          mediaType: MediaType.SHOW,
          type: RuleType.DATE,
        },
        {
          id: 5,
          name: 'seasons',
          humanName: 'Number of seasons / episodes (also unavailable)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 6,
          name: 'status',
          humanName: 'Status (continuing, ended)',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 7,
          name: 'ended',
          humanName: 'Show ended',
          mediaType: MediaType.SHOW,
          type: RuleType.BOOL,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 8,
          name: 'monitored',
          humanName: 'Is monitored (deprecated)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
        },
        {
          id: 9,
          name: 'monitored',
          humanName: 'Is monitored',
          mediaType: MediaType.SHOW,
          type: RuleType.BOOL,
        },
        {
          id: 10,
          name: 'unaired_episodes',
          humanName: 'Has unaired episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.BOOL,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 11,
          name: 'seasons_monitored',
          humanName: 'Number of monitored seasons / episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 12,
          name: 'unaired_episodes_season',
          humanName: 'Season has unaired episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.BOOL,
          showType: [EPlexDataType.EPISODES],
        },
        {
          id: 13,
          name: 'part_of_latest_season',
          humanName: 'Is (part of) latest aired/airing season',
          mediaType: MediaType.SHOW,
          type: RuleType.BOOL,
          showType: [EPlexDataType.EPISODES, EPlexDataType.SEASONS],
        },
        {
          id: 14,
          name: 'filePath',
          humanName: 'Base file path (show)',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT,
        },
        {
          id: 15,
          name: 'originalLanguage',
          humanName: 'Original language',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT,
        },
        {
          id: 16,
          name: 'seasonFinale',
          humanName: 'Has season finale episode',
          mediaType: MediaType.SHOW,
          type: RuleType.BOOL,
          showType: [EPlexDataType.SEASONS],
        },
        {
          id: 17,
          name: 'seriesFinale',
          humanName: 'Has series finale episode',
          mediaType: MediaType.SHOW,
          type: RuleType.BOOL,
          showType: [EPlexDataType.SEASONS],
        },
        {
          id: 18,
          name: 'seasonNumber',
          humanName: 'Season number',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.EPISODES, EPlexDataType.SEASONS],
        },
        {
          id: 19,
          name: 'rating',
          humanName: 'Show rating (IMDb) (scale 0-10)',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
        },
        {
          id: 20,
          name: 'ratingVotes',
          humanName: 'Show rating (IMDb) vote count',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
        },
        {
          id: 21,
          name: 'episodeFilePath',
          humanName: 'Episode file path',
          showType: [EPlexDataType.EPISODES],
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT,
        },
        {
          id: 22,
          name: 'episodeNumber',
          humanName: 'Episode number',
          showType: [EPlexDataType.EPISODES],
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
        },
      ],
    },
    {
      id: Application.OVERSEERR,
      name: 'Overseerr',
      mediaType: MediaType.BOTH,
      props: [
        {
          id: 0,
          name: 'addUser',
          humanName: 'Requested by user (Plex or local username)',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT,
        }, //  returns username[]
        {
          id: 1,
          name: 'requestDate',
          humanName: 'Request date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 2,
          name: 'releaseDate',
          humanName: 'Release/air date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 3,
          name: 'approvalDate',
          humanName: 'Approval date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 4,
          name: 'mediaAddedAt',
          humanName: 'Media downloaded date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 5,
          name: 'amountRequested',
          humanName: 'Amount of requests',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
        },
        {
          id: 6,
          name: 'isRequested',
          humanName: 'Requested in Overseerr',
          mediaType: MediaType.BOTH,
          type: RuleType.BOOL,
        },
      ],
    },
    {
      id: Application.TAUTULLI,
      name: 'Tautulli',
      mediaType: MediaType.BOTH,
      props: [
        {
          id: 0,
          name: 'seenBy',
          humanName: '[list] Viewed by (username)',
          mediaType: MediaType.MOVIE,
          type: RuleType.TEXT_LIST, // returns usernames []
        },
        {
          id: 1,
          name: 'sw_allEpisodesSeenBy',
          humanName: '[list] Users that saw all available episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT_LIST, // return usernames []
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 2,
          name: 'addDate',
          humanName: 'Date added',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 3,
          name: 'viewCount',
          humanName: 'Times viewed',
          mediaType: MediaType.MOVIE,
          type: RuleType.NUMBER,
        },
        {
          id: 4,
          name: 'lastViewedAt',
          humanName: 'Last view date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 5,
          name: 'sw_amountOfViews',
          humanName: 'Total views',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
        },
        {
          id: 6,
          name: 'sw_viewedEpisodes',
          humanName: 'Amount of watched episodes',
          mediaType: MediaType.SHOW,
          type: RuleType.NUMBER,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 7,
          name: 'sw_lastWatched',
          humanName: 'Newest episode view date',
          mediaType: MediaType.SHOW,
          type: RuleType.DATE,
          showType: [EPlexDataType.SHOWS, EPlexDataType.SEASONS],
        },
        {
          id: 8,
          name: 'sw_watchers',
          humanName: '[list] Users that watch the show/season/episode',
          mediaType: MediaType.SHOW,
          type: RuleType.TEXT_LIST, // return usernames []
          showType: [
            EPlexDataType.SHOWS,
            EPlexDataType.SEASONS,
            EPlexDataType.EPISODES,
          ],
        },
      ],
    },
    {
      id: Application.JELLYSEERR,
      name: 'Jellyseerr',
      mediaType: MediaType.BOTH,
      props: [
        {
          id: 0,
          name: 'addUser',
          humanName:
            'Requested by user (Jellyfin, Emby, Plex or local username)',
          mediaType: MediaType.BOTH,
          type: RuleType.TEXT,
        }, //  returns username[]
        {
          id: 1,
          name: 'requestDate',
          humanName: 'Request date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 2,
          name: 'releaseDate',
          humanName: 'Release/air date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 3,
          name: 'approvalDate',
          humanName: 'Approval date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 4,
          name: 'mediaAddedAt',
          humanName: 'Media downloaded date',
          mediaType: MediaType.BOTH,
          type: RuleType.DATE,
        },
        {
          id: 5,
          name: 'amountRequested',
          humanName: 'Amount of requests',
          mediaType: MediaType.BOTH,
          type: RuleType.NUMBER,
        },
        {
          id: 6,
          name: 'isRequested',
          humanName: 'Requested in Jellyseerr',
          mediaType: MediaType.BOTH,
          type: RuleType.BOOL,
        },
      ],
    },
  ]
}

export const ruleDefinitionSchema = z
  .object({
    operator: z.coerce.number().pipe(z.nativeEnum(RuleOperators)).nullable(),
    action: z.coerce.number().pipe(z.nativeEnum(RulePossibility)),
    firstVal: z.tuple([z.number(), z.number()]),
    lastVal: z.tuple([z.number(), z.number()]).optional(),
    customVal: z
      .object({
        ruleTypeId: z.coerce.number().pipe(z.nativeEnum(RuleTypes)),
        value: z.string(),
      })
      .optional(),
    section: z.number(),
  })
  .superRefine((rule, ctx) => {
    const ruleConstants = new RuleConstants()

    try {
      const val1 = ruleConstants.applications
        .find((el) => el.id === rule.firstVal[0])
        ?.props.find((el) => el.id === rule.firstVal[1])

      if (!val1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid first value',
          path: ['firstVal'],
        })
        return
      }

      if (rule.lastVal) {
        const val2 = ruleConstants.applications
          .find((el) => el.id === rule.lastVal?.[0])
          ?.props.find((el) => el.id === rule.lastVal?.[1])

        if (!val2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid last value',
            path: ['lastVal'],
          })
          return
        }

        if (
          val1.type === val2.type ||
          ([RuleType.TEXT_LIST, RuleType.TEXT].includes(val1.type) &&
            [RuleType.TEXT_LIST, RuleType.TEXT].includes(val2.type))
        ) {
          if (!val1.type.possibilities.includes(+rule.action)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                'The specified action is not supported for the provided first value',
              path: ['action'],
            })
          }
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'First value and last value are not compatible',
            path: ['firstVal', 'lastVal'],
          })
        }
      } else if (rule.customVal) {
        if (
          val1.type.toString() === rule.customVal.ruleTypeId.toString() ||
          (val1.type == RuleType.TEXT_LIST &&
            rule.customVal.ruleTypeId.toString() == RuleType.TEXT.toString())
        ) {
          if (!val1.type.possibilities.includes(+rule.action)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                'The specified action is not supported for the provided first value',
              path: ['action'],
            })
          }
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid custom value',
            path: ['customVal'],
          })
        }
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'One of lastVal or customVal is required',
          path: ['customVal'],
        })
      }
    } catch (e) {
      console.debug(e)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unexpected error occurred during validation',
        path: [''],
      })
    }
  })

export const ruleSchema = z.object({
  id: z.number(),
  rule: ruleDefinitionSchema,
  section: z.number(),
  ruleGroupId: z.number(),
  isActive: z.boolean(),
})

export interface IComparisonStatistics {
  plexId: number
  result: boolean
  sectionResults: ISectionComparisonResults[]
}

export interface ISectionComparisonResults {
  id: number
  result: boolean
  operator?: string
  ruleResults: IRuleComparisonResult[]
}

export interface IRuleComparisonResult {
  firstValueName: string
  firstValue: RuleValueType
  secondValueName: string
  secondValue: RuleValueType
  action: string
  operator?: string
  result: boolean
}
