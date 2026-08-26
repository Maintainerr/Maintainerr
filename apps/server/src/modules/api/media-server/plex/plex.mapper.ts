import {
  MediaActor,
  MediaCollection,
  MediaGenre,
  MediaItem,
  MediaItemType,
  MediaLibrary,
  MediaPlaylist,
  MediaProviderIds,
  MediaRating,
  MediaServerStatus,
  MediaSource,
  MediaUser,
  WatchRecord,
  isValidMediaItemType,
} from '@maintainerr/contracts';
import { EPlexDataType } from '../../plex-api/enums/plex-data-type-enum';
import {
  PlexCollection,
  PlexPlaylist,
} from '../../plex-api/interfaces/collection.interface';
import {
  PlexActor,
  PlexGenre,
  PlexLibrary,
  PlexLibraryItem,
  PlexSeenBy,
  PlexUserAccount,
} from '../../plex-api/interfaces/library.interfaces';
import { Media, PlexMetadata } from '../../plex-api/interfaces/media.interface';
import { addProviderId, emptyProviderIds } from '../media-provider-ids.utils';

const GUID_SCHEME_SEPARATOR = '://';
const LEGACY_AGENT_PREFIX = 'com.plexapp.agents.';
const PLEX_AGENT_GUID_PREFIX = `plex${GUID_SCHEME_SEPARATOR}`;

/**
 * Mapper for converting Plex-specific types to server-agnostic MediaItem types.
 *
 * Key mappings:
 * - ratingKey → id
 * - title → title
 * - type → type (with enum mapping)
 * - addedAt (unix timestamp) → addedAt (Date)
 * - duration (ms) → durationMs
 * - Guid[] → providerIds { imdb, tmdb, tvdb, sportarr }
 * - Media[] → mediaSources
 */
export class PlexMapper {
  static isSupportedLibrary(
    plex: PlexLibrary,
  ): plex is PlexLibrary & { type: MediaLibrary['type'] } {
    return plex.type === 'movie' || plex.type === 'show';
  }

  /**
   * Convert Plex type string to MediaItemType string.
   * This is what the API returns to the frontend.
   */
  static toMediaItemType(
    plexType: 'movie' | 'show' | 'season' | 'episode' | 'collection',
  ): MediaItemType {
    switch (plexType) {
      case 'movie':
        return 'movie';
      case 'show':
        return 'show';
      case 'season':
        return 'season';
      case 'episode':
        return 'episode';
      case 'collection':
        // Collections don't have a dedicated MediaItemType - default to movie for API consistency
        return 'movie';
      default:
        return 'movie';
    }
  }

  /**
   * Convert MediaItemType to EPlexDataType.
   * Used when calling Plex API methods that require the Plex-specific enum.
   */
  static toPlexDataType(type: MediaItemType): EPlexDataType {
    switch (type) {
      case 'movie':
        return EPlexDataType.MOVIES;
      case 'show':
        return EPlexDataType.SHOWS;
      case 'season':
        return EPlexDataType.SEASONS;
      case 'episode':
        return EPlexDataType.EPISODES;
      default:
        return EPlexDataType.MOVIES;
    }
  }

  /**
   * Convert EPlexDataType enum to MediaItemType string.
   */
  static plexDataTypeToMediaItemType(plexType: EPlexDataType): MediaItemType {
    switch (plexType) {
      case EPlexDataType.MOVIES:
        return 'movie';
      case EPlexDataType.SHOWS:
        return 'show';
      case EPlexDataType.SEASONS:
        return 'season';
      case EPlexDataType.EPISODES:
        return 'episode';
      default:
        return 'movie';
    }
  }

  /**
   * Extract provider IDs (IMDB, TMDB, TVDB, Sportarr) from Plex GUID format.
   *
   * Plex GUIDs look like:
   * - "imdb://tt1234567"
   * - "tmdb://12345"
   * - "tvdb://12345"
   * - "sportarr://lg-000278"
   * - "plex://movie/5d776830880197001ec7f3eb"
   * - "com.plexapp.agents.thetvdb://73141/1/1?lang=en" (legacy agent)
   *
   * @param fallbackGuid - The item's own `guid`. A library still matched by a
   *   legacy agent carries no `Guid[]`, and keeps the provider id here.
   */
  static extractProviderIds(
    guids: { id: string }[] | undefined,
    fallbackGuid?: string,
  ): MediaProviderIds {
    const providerIds = emptyProviderIds();

    const collect = (guid: string | undefined) => {
      const schemeEnd = guid?.indexOf(GUID_SCHEME_SEPARATOR) ?? -1;
      if (schemeEnd < 1) return;

      // A legacy agent names the provider in the scheme
      // (com.plexapp.agents.thetvdb://), and appends the season and episode to
      // the series id with a language on the end: 73141/1/1?lang=en.
      const scheme = guid.slice(0, schemeEnd).toLowerCase();
      const id = guid
        .slice(schemeEnd + GUID_SCHEME_SEPARATOR.length)
        .split('/', 1)[0]
        .split('?', 1)[0];

      addProviderId(
        providerIds,
        scheme.startsWith(LEGACY_AGENT_PREFIX)
          ? scheme.slice(LEGACY_AGENT_PREFIX.length)
          : scheme,
        id,
      );
    };

    for (const guid of Array.isArray(guids) ? guids : []) {
      collect(guid?.id);
    }
    collect(fallbackGuid);

    return providerIds;
  }

  /**
   * The id Plex's own agent gives an item, from a `plex://<type>/<uuid>` guid.
   *
   * Undefined for anything else - a legacy-agent, unmatched or personal-media
   * guid carries no such id. plex.tv keys watchlist entries on it, so an item
   * without one can never appear on a watchlist.
   */
  static extractPlexAgentId(guid?: string): string | undefined {
    if (!guid?.startsWith(PLEX_AGENT_GUID_PREFIX)) {
      return undefined;
    }

    const typeEnd = guid.indexOf('/', PLEX_AGENT_GUID_PREFIX.length);
    if (typeEnd <= PLEX_AGENT_GUID_PREFIX.length) {
      return undefined;
    }

    const id = guid.slice(typeEnd + 1);
    for (const character of id) {
      const isDigit = character >= '0' && character <= '9';
      const isLowercaseLetter = character >= 'a' && character <= 'z';

      if (!isDigit && !isLowercaseLetter) {
        return undefined;
      }
    }

    return id || undefined;
  }

  /**
   * Convert a Plex library item to a MediaItem.
   */
  static toMediaItem(plex: PlexLibraryItem): MediaItem {
    return {
      id: plex.ratingKey,
      parentId: plex.parentRatingKey,
      grandparentId: plex.grandparentRatingKey,
      title: plex.title,
      parentTitle: plex.parentTitle,
      grandparentTitle: plex.grandparentTitle,
      guid: plex.guid,
      parentGuid: plex.parentGuid,
      grandparentGuid: plex.grandparentGuid,
      type: PlexMapper.toMediaItemType(plex.type),
      addedAt: new Date(plex.addedAt * 1000),
      updatedAt: plex.updatedAt ? new Date(plex.updatedAt * 1000) : undefined,
      providerIds: PlexMapper.extractProviderIds(plex.Guid, plex.guid),
      mediaSources: PlexMapper.toMediaSources(plex.Media),
      library: {
        id: plex.librarySectionID?.toString(),
        title: plex.librarySectionTitle,
      },
      summary: plex.summary,
      viewCount: plex.viewCount,
      skipCount: plex.skipCount,
      lastViewedAt: plex.lastViewedAt
        ? new Date(plex.lastViewedAt * 1000)
        : undefined,
      year: plex.year,
      durationMs: plex.duration,
      originallyAvailableAt: plex.originallyAvailableAt
        ? new Date(plex.originallyAvailableAt)
        : undefined,
      contentRating: plex.contentRating,
      ratings: PlexMapper.toMediaRatings(plex),
      userRating: plex.userRating,
      genres: PlexMapper.toMediaGenres(plex.Genre),
      actors: PlexMapper.toMediaActors(plex.Role),
      studios: PlexMapper.toMediaStudios(plex.studio),
      childCount: plex.leafCount,
      watchedChildCount: plex.viewedLeafCount,
      index: plex.index,
      parentIndex: plex.parentIndex,
      collections: plex.Collection?.map((c) => c.tag),
      labels: plex.Label?.map((l) => l.tag),
    };
  }

  /**
   * Convert Plex metadata to MediaItem.
   * PlexMetadata has slightly different structure than PlexLibraryItem.
   */
  static metadataToMediaItem(plex: PlexMetadata): MediaItem {
    return {
      id: plex.ratingKey,
      parentId: plex.parentRatingKey?.toString(),
      grandparentId: plex.grandparentRatingKey?.toString(),
      title: plex.title,
      parentTitle: plex.parentTitle,
      grandparentTitle: plex.grandparentTitle,
      guid: plex.guid,
      parentGuid: undefined,
      grandparentGuid: undefined,
      type: PlexMapper.toMediaItemType(plex.type),
      addedAt: new Date(plex.addedAt * 1000),
      updatedAt: plex.updatedAt ? new Date(plex.updatedAt * 1000) : undefined,
      providerIds: PlexMapper.extractProviderIds(plex.Guid, plex.guid),
      mediaSources: PlexMapper.toMediaSources(plex.Media || plex.media),
      library: {
        id: plex.librarySectionID?.toString() ?? '',
        title: plex.librarySectionTitle ?? '',
      },
      summary: plex.summary,
      viewCount: plex.viewCount,
      skipCount: undefined,
      lastViewedAt: plex.lastViewedAt
        ? new Date(plex.lastViewedAt * 1000)
        : undefined,
      year: plex.year,
      durationMs: plex.media?.[0]?.duration,
      originallyAvailableAt: plex.originallyAvailableAt
        ? new Date(plex.originallyAvailableAt)
        : undefined,
      contentRating: plex.contentRating,
      ratings: PlexMapper.metadataToMediaRatings(plex),
      userRating: plex.userRating,
      genres: PlexMapper.toMediaGenres(plex.Genre),
      actors: PlexMapper.toMediaActors(plex.Role),
      studios: PlexMapper.toMediaStudios(plex.studio),
      childCount: plex.leafCount,
      watchedChildCount: plex.viewedLeafCount,
      index: plex.index,
      parentIndex: plex.parentIndex,
      collections: plex.Collection?.map((c) => c.tag),
      labels: plex.Label?.map((l) => l.tag),
    };
  }

  /**
   * Convert Plex library to MediaLibrary.
   */
  static toMediaLibrary(
    plex: PlexLibrary & { type: MediaLibrary['type'] },
  ): MediaLibrary {
    return {
      id: plex.key,
      title: plex.title,
      type: plex.type,
      agent: plex.agent,
    };
  }

  /**
   * Convert Plex user account to MediaUser.
   */
  static toMediaUser(plex: PlexUserAccount): MediaUser {
    return {
      id: plex.id.toString(),
      name: plex.name,
      thumb: plex.thumb,
    };
  }

  /**
   * Convert Plex seen-by record to WatchRecord.
   */
  static toWatchRecord(plex: PlexSeenBy): WatchRecord {
    return {
      userId: plex.accountID.toString(),
      itemId: plex.ratingKey,
      watchedAt: new Date(plex.viewedAt * 1000),
      progress: 100, // Plex marks as "seen" when complete
    };
  }

  /**
   * Convert Plex collection to MediaCollection.
   */
  static toMediaCollection(plex: PlexCollection): MediaCollection {
    return {
      id: plex.ratingKey,
      title: plex.title,
      summary: plex.summary,
      thumb: plex.thumb,
      childCount: parseInt(plex.childCount, 10) || 0,
      addedAt: plex.addedAt ? new Date(plex.addedAt * 1000) : undefined,
      updatedAt: plex.updatedAt ? new Date(plex.updatedAt * 1000) : undefined,
      smart: plex.smart,
      // Deliberately not toMediaItemType: that defaults to 'movie', which would
      // turn an unrecognised subtype into a confident wrong answer, and callers
      // read undefined as "unknown" rather than as a mismatch.
      type: isValidMediaItemType(plex.subtype) ? plex.subtype : undefined,
      libraryId: undefined, // Not available on PlexCollection directly
    };
  }

  /**
   * Convert Plex playlist to MediaPlaylist.
   */
  static toMediaPlaylist(plex: PlexPlaylist): MediaPlaylist {
    return {
      id: plex.ratingKey,
      title: plex.title,
      summary: plex.summary,
      smart: plex.smart,
      itemCount: plex.leafCount || plex.itemCount || 0,
      durationMs: plex.duration,
      addedAt: plex.addedAt ? new Date(plex.addedAt * 1000) : undefined,
      updatedAt: plex.updatedAt ? new Date(plex.updatedAt * 1000) : undefined,
    };
  }

  /**
   * Convert Plex server status to MediaServerStatus.
   */
  static toMediaServerStatus(
    plex: { machineIdentifier: string; version: string },
    serverName?: string,
  ): MediaServerStatus {
    return {
      machineId: plex.machineIdentifier,
      version: plex.version,
      name: serverName,
      platform: undefined,
    };
  }

  private static toMediaSources(media: Media[] | undefined): MediaSource[] {
    if (!media || !Array.isArray(media)) {
      return [];
    }

    return media.map((m) => ({
      id: m.id.toString(),
      duration: m.duration,
      bitrate: m.bitrate,
      width: m.width,
      height: m.height,
      aspectRatio: m.aspectRatio,
      audioChannels: m.audioChannels,
      audioCodec: m.audioCodec,
      videoCodec: m.videoCodec,
      videoResolution: m.videoResolution,
      container: m.container,
      sizeBytes:
        m.Part?.reduce((sum, p) => sum + (p.size || 0), 0) || undefined,
    }));
  }

  private static toMediaGenres(genres: PlexGenre[] | undefined): MediaGenre[] {
    if (!genres || !Array.isArray(genres)) {
      return [];
    }

    return genres.map((g) => ({
      id: g.id,
      name: g.tag,
    }));
  }

  private static toMediaActors(actors: PlexActor[] | undefined): MediaActor[] {
    if (!actors || !Array.isArray(actors)) {
      return [];
    }

    return actors.map((a) => ({
      id: a.id,
      name: a.tag,
      role: a.role,
      thumb: a.thumb,
    }));
  }

  /**
   * Plex sends one studio as a string where Jellyfin and Emby send a list.
   * Undefined rather than empty, so the sort still reads it as unknown.
   */
  private static toMediaStudios(
    studio: string | undefined,
  ): string[] | undefined {
    return studio?.trim() ? [studio] : undefined;
  }

  private static toMediaRatings(plex: PlexLibraryItem): MediaRating[] {
    const ratings: MediaRating[] = [];

    if (plex.rating !== undefined) {
      ratings.push({
        source: 'critic',
        value: plex.rating,
        type: 'critic',
      });
    }

    if (plex.audienceRating !== undefined) {
      ratings.push({
        source: 'audience',
        value: plex.audienceRating,
        type: 'audience',
      });
    }

    return ratings;
  }

  private static metadataToMediaRatings(plex: PlexMetadata): MediaRating[] {
    const ratings: MediaRating[] = [];

    if (plex.rating !== undefined) {
      ratings.push({
        source: 'critic',
        value: plex.rating,
        type: 'critic',
      });
    }

    if (plex.audienceRating !== undefined) {
      ratings.push({
        source: 'audience',
        value: plex.audienceRating,
        type: 'audience',
      });
    }

    // PlexMetadata also has Rating[] array
    if (plex.Rating && Array.isArray(plex.Rating)) {
      for (const r of plex.Rating) {
        if (!ratings.some((existing) => existing.type === r.type)) {
          ratings.push({
            source: r.image,
            value: r.value,
            type: r.type,
          });
        }
      }
    }

    return ratings;
  }
}
