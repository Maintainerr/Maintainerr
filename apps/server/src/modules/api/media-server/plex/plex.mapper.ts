import {
  EMediaDataType,
  MediaActor,
  MediaCollection,
  MediaGenre,
  MediaItem,
  MediaLibrary,
  MediaPlaylist,
  MediaProviderIds,
  MediaRating,
  MediaServerStatus,
  MediaSource,
  MediaUser,
  WatchRecord,
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
  PlexRating,
  PlexSeenBy,
  PlexUserAccount,
} from '../../plex-api/interfaces/library.interfaces';
import { Media, PlexMetadata } from '../../plex-api/interfaces/media.interface';

/**
 * Mapper for converting Plex-specific types to server-agnostic MediaItem types.
 *
 * Key mappings:
 * - ratingKey → id
 * - title → title
 * - type → type (with enum mapping)
 * - addedAt (unix timestamp) → addedAt (Date)
 * - duration (ms) → durationMs
 * - Guid[] → providerIds { imdb, tmdb, tvdb }
 * - Media[] → mediaSources
 */
export class PlexMapper {
  // ============================================================
  // TYPE CONVERSIONS
  // ============================================================

  /**
   * Convert Plex type string to EMediaDataType enum.
   */
  static toMediaDataType(
    plexType: 'movie' | 'show' | 'season' | 'episode' | 'collection',
  ): EMediaDataType {
    switch (plexType) {
      case 'movie':
        return EMediaDataType.MOVIE;
      case 'show':
        return EMediaDataType.SHOW;
      case 'season':
        return EMediaDataType.SEASON;
      case 'episode':
        return EMediaDataType.EPISODE;
      case 'collection':
        // Collections aren't really a media type, but map to MOVIE for compatibility
        return EMediaDataType.MOVIE;
      default:
        return EMediaDataType.MOVIE;
    }
  }

  /**
   * Convert EMediaDataType to EPlexDataType.
   * Used when calling Plex API methods that require the Plex-specific enum.
   */
  static toPlexDataType(type: EMediaDataType): EPlexDataType {
    switch (type) {
      case EMediaDataType.MOVIE:
        return EPlexDataType.MOVIES;
      case EMediaDataType.SHOW:
        return EPlexDataType.SHOWS;
      case EMediaDataType.SEASON:
        return EPlexDataType.SEASONS;
      case EMediaDataType.EPISODE:
        return EPlexDataType.EPISODES;
      default:
        return EPlexDataType.MOVIES;
    }
  }

  /**
   * Convert EPlexDataType to EMediaDataType.
   */
  static fromPlexDataType(plexType: EPlexDataType): EMediaDataType {
    switch (plexType) {
      case EPlexDataType.MOVIES:
        return EMediaDataType.MOVIE;
      case EPlexDataType.SHOWS:
        return EMediaDataType.SHOW;
      case EPlexDataType.SEASONS:
        return EMediaDataType.SEASON;
      case EPlexDataType.EPISODES:
        return EMediaDataType.EPISODE;
      default:
        return EMediaDataType.MOVIE;
    }
  }

  // ============================================================
  // PROVIDER ID EXTRACTION
  // ============================================================

  /**
   * Extract provider IDs (IMDB, TMDB, TVDB) from Plex GUID format.
   *
   * Plex GUIDs look like:
   * - "imdb://tt1234567"
   * - "tmdb://12345"
   * - "tvdb://12345"
   * - "plex://movie/5d776830880197001ec7f3eb"
   */
  static extractProviderIds(guids: { id: string }[] | undefined): MediaProviderIds {
    const providerIds: MediaProviderIds = {};

    if (!guids || !Array.isArray(guids)) {
      return providerIds;
    }

    for (const guid of guids) {
      if (!guid.id) continue;

      const match = guid.id.match(/^(\w+):\/\/(.+)$/);
      if (!match) continue;

      const [, provider, id] = match;

      switch (provider.toLowerCase()) {
        case 'imdb':
          providerIds.imdb = id;
          break;
        case 'tmdb':
          providerIds.tmdb = id;
          break;
        case 'tvdb':
          providerIds.tvdb = id;
          break;
        // Ignore plex:// and other unknown providers
      }
    }

    return providerIds;
  }

  // ============================================================
  // MAIN CONVERTERS
  // ============================================================

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
      grandparentTitle: undefined, // Not available on PlexLibraryItem
      guid: plex.guid,
      parentGuid: plex.parentGuid,
      grandparentGuid: plex.grandparentGuid,
      type: this.toMediaDataType(plex.type),
      addedAt: new Date(plex.addedAt * 1000),
      updatedAt: plex.updatedAt ? new Date(plex.updatedAt * 1000) : undefined,
      providerIds: this.extractProviderIds(plex.Guid),
      mediaSources: this.toMediaSources(plex.Media),
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
      ratings: this.toMediaRatings(plex),
      userRating: plex.userRating,
      genres: this.toMediaGenres(plex.Genre),
      actors: this.toMediaActors(plex.Role),
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
      type: this.toMediaDataType(plex.type),
      addedAt: new Date(plex.addedAt * 1000),
      updatedAt: plex.updatedAt ? new Date(plex.updatedAt * 1000) : undefined,
      providerIds: this.extractProviderIds(plex.Guid),
      mediaSources: this.toMediaSources(plex.Media || plex.media),
      library: {
        id: '', // Not available on PlexMetadata
        title: '',
      },
      summary: undefined,
      viewCount: undefined,
      skipCount: undefined,
      lastViewedAt: undefined,
      year: undefined,
      durationMs: plex.media?.[0]?.duration,
      originallyAvailableAt: plex.originallyAvailableAt
        ? new Date(plex.originallyAvailableAt)
        : undefined,
      ratings: this.metadataToMediaRatings(plex),
      userRating: plex.userRating,
      genres: this.toMediaGenres(plex.Genre),
      actors: this.toMediaActors(plex.Role),
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
  static toMediaLibrary(plex: PlexLibrary): MediaLibrary {
    return {
      id: plex.key,
      title: plex.title,
      type: plex.type === 'movie' ? 'movie' : 'show',
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

  // ============================================================
  // HELPER CONVERTERS
  // ============================================================

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
