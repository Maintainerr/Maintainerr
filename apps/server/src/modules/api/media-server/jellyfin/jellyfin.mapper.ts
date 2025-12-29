/**
 * Mapper for converting Jellyfin SDK types to Maintainerr's server-agnostic types.
 *
 * Key mappings:
 * - Id → id
 * - Name → title
 * - Type → type (with enum mapping)
 * - DateCreated → addedAt (ISO string → Date)
 * - RunTimeTicks → durationMs (ticks → ms)
 * - ProviderIds → providerIds { imdb, tmdb, tvdb }
 * - MediaSources → mediaSources
 */

import {
  type BaseItemDto,
  BaseItemKind,
  type UserDto,
  type MediaSourceInfo,
} from '@jellyfin/sdk/lib/generated-client/models';
import {
  EMediaDataType,
  type MediaActor,
  type MediaCollection,
  type MediaGenre,
  type MediaItem,
  type MediaLibrary,
  type MediaPlaylist,
  type MediaProviderIds,
  type MediaRating,
  type MediaServerStatus,
  type MediaSource,
  type MediaUser,
  type WatchRecord,
} from '@maintainerr/contracts';
import { JELLYFIN_TICKS_PER_MS } from './jellyfin.constants';

/**
 * Mapper class for converting between Jellyfin SDK types and Maintainerr types.
 */
export class JellyfinMapper {
  // ============================================================
  // TYPE CONVERSIONS
  // ============================================================

  /**
   * Convert Jellyfin BaseItemKind to EMediaDataType enum.
   */
  static toMediaDataType(kind?: BaseItemKind | string): EMediaDataType {
    switch (kind) {
      case BaseItemKind.Movie:
      case 'Movie':
        return EMediaDataType.MOVIE;
      case BaseItemKind.Series:
      case 'Series':
        return EMediaDataType.SHOW;
      case BaseItemKind.Season:
      case 'Season':
        return EMediaDataType.SEASON;
      case BaseItemKind.Episode:
      case 'Episode':
        return EMediaDataType.EPISODE;
      default:
        return EMediaDataType.MOVIE;
    }
  }

  /**
   * Convert EMediaDataType to Jellyfin BaseItemKind.
   */
  static toBaseItemKind(type: EMediaDataType): BaseItemKind {
    switch (type) {
      case EMediaDataType.MOVIE:
        return BaseItemKind.Movie;
      case EMediaDataType.SHOW:
        return BaseItemKind.Series;
      case EMediaDataType.SEASON:
        return BaseItemKind.Season;
      case EMediaDataType.EPISODE:
        return BaseItemKind.Episode;
      default:
        return BaseItemKind.Movie;
    }
  }

  /**
   * Convert multiple EMediaDataType values to BaseItemKind array.
   */
  static toBaseItemKinds(types?: EMediaDataType[]): BaseItemKind[] {
    if (!types?.length) {
      return [BaseItemKind.Movie, BaseItemKind.Series];
    }
    return types.map((type) => this.toBaseItemKind(type));
  }

  // ============================================================
  // PROVIDER ID EXTRACTION
  // ============================================================

  /**
   * Extract provider IDs from Jellyfin ProviderIds object.
   *
   * Jellyfin stores provider IDs directly:
   * - ProviderIds.Imdb = "tt1234567"
   * - ProviderIds.Tmdb = "12345"
   * - ProviderIds.Tvdb = "12345"
   */
  static extractProviderIds(
    providerIds?: Record<string, string | null> | null,
  ): MediaProviderIds {
    const result: MediaProviderIds = {};

    if (!providerIds) {
      return result;
    }

    // Jellyfin uses capitalized keys
    if (providerIds.Imdb) {
      result.imdb = providerIds.Imdb;
    }
    if (providerIds.Tmdb) {
      result.tmdb = providerIds.Tmdb;
    }
    if (providerIds.Tvdb) {
      result.tvdb = providerIds.Tvdb;
    }

    return result;
  }

  // ============================================================
  // MAIN CONVERTERS
  // ============================================================

  /**
   * Convert a Jellyfin BaseItemDto to a MediaItem.
   */
  static toMediaItem(item: BaseItemDto): MediaItem {
    return {
      id: item.Id || '',
      parentId: item.ParentId || undefined,
      grandparentId: item.SeriesId || undefined,
      title: item.Name || '',
      parentTitle: item.SeasonName || item.SeriesName || undefined,
      grandparentTitle: item.SeriesName || undefined,
      guid: item.Id || '', // Jellyfin uses Id as guid
      parentGuid: item.ParentId || undefined,
      grandparentGuid: item.SeriesId || undefined,
      type: this.toMediaDataType(item.Type),
      addedAt: item.DateCreated ? new Date(item.DateCreated) : new Date(),
      updatedAt: (item as { DateLastSaved?: string }).DateLastSaved
        ? new Date((item as { DateLastSaved?: string }).DateLastSaved!)
        : undefined,
      providerIds: this.extractProviderIds(item.ProviderIds),
      mediaSources: this.toMediaSources(item.MediaSources),
      library: {
        id: item.ParentId || '',
        title: '',
      },
      summary: item.Overview || undefined,
      viewCount: item.UserData?.PlayCount || undefined,
      skipCount: undefined, // Jellyfin doesn't track skip count
      lastViewedAt: item.UserData?.LastPlayedDate
        ? new Date(item.UserData.LastPlayedDate)
        : undefined,
      year: item.ProductionYear || undefined,
      durationMs: item.RunTimeTicks
        ? Math.floor(item.RunTimeTicks / JELLYFIN_TICKS_PER_MS)
        : undefined,
      originallyAvailableAt: item.PremiereDate
        ? new Date(item.PremiereDate)
        : undefined,
      ratings: this.toMediaRatings(item),
      userRating: item.UserData?.Rating || undefined,
      genres: this.toMediaGenres(item.Genres),
      actors: this.toMediaActors(item.People),
      childCount: item.ChildCount || undefined,
      watchedChildCount: item.UserData?.PlayedPercentage
        ? Math.floor((item.ChildCount || 0) * (item.UserData.PlayedPercentage / 100))
        : undefined,
      index: item.IndexNumber || undefined,
      parentIndex: item.ParentIndexNumber || undefined,
      collections: undefined, // Need to query separately
      labels: item.Tags || undefined,
    };
  }

  /**
   * Convert Jellyfin library folder to MediaLibrary.
   */
  static toMediaLibrary(item: BaseItemDto): MediaLibrary {
    return {
      id: item.Id || '',
      title: item.Name || '',
      type: this.toLibraryType(item.CollectionType),
      agent: undefined, // Jellyfin doesn't expose agent info
    };
  }

  /**
   * Convert Jellyfin collection type to library type.
   */
  static toLibraryType(
    collectionType?: string | null,
  ): 'movie' | 'show' {
    switch (collectionType?.toLowerCase()) {
      case 'movies':
        return 'movie';
      case 'tvshows':
        return 'show';
      default:
        return 'movie';
    }
  }

  /**
   * Convert Jellyfin user to MediaUser.
   */
  static toMediaUser(user: UserDto): MediaUser {
    return {
      id: user.Id || '',
      name: user.Name || '',
      thumb: user.PrimaryImageTag
        ? `/Users/${user.Id}/Images/Primary`
        : undefined,
    };
  }

  /**
   * Convert to WatchRecord from user data.
   */
  static toWatchRecord(
    userId: string,
    itemId: string,
    lastPlayedDate?: Date,
    playCount?: number,
  ): WatchRecord {
    return {
      userId,
      itemId,
      watchedAt: lastPlayedDate || new Date(),
      progress: 100, // Marked as watched = 100%
    };
  }

  /**
   * Convert Jellyfin BoxSet to MediaCollection.
   */
  static toMediaCollection(item: BaseItemDto): MediaCollection {
    return {
      id: item.Id || '',
      title: item.Name || '',
      summary: item.Overview || undefined,
      thumb: item.ImageTags?.Primary
        ? `/Items/${item.Id}/Images/Primary`
        : undefined,
      childCount: item.ChildCount || 0,
      addedAt: item.DateCreated ? new Date(item.DateCreated) : undefined,
      updatedAt: (item as { DateLastSaved?: string }).DateLastSaved
        ? new Date((item as { DateLastSaved?: string }).DateLastSaved!)
        : undefined,
      smart: false, // Jellyfin doesn't have smart collections
      libraryId: item.ParentId || undefined,
    };
  }

  /**
   * Convert Jellyfin playlist to MediaPlaylist.
   */
  static toMediaPlaylist(item: BaseItemDto): MediaPlaylist {
    return {
      id: item.Id || '',
      title: item.Name || '',
      summary: item.Overview || undefined,
      smart: false,
      itemCount: item.ChildCount || 0,
      durationMs: item.RunTimeTicks
        ? Math.floor(item.RunTimeTicks / JELLYFIN_TICKS_PER_MS)
        : undefined,
      addedAt: item.DateCreated ? new Date(item.DateCreated) : undefined,
      updatedAt: (item as { DateLastSaved?: string }).DateLastSaved
        ? new Date((item as { DateLastSaved?: string }).DateLastSaved!)
        : undefined,
    };
  }

  /**
   * Convert Jellyfin server info to MediaServerStatus.
   */
  static toMediaServerStatus(
    machineId: string,
    version: string,
    serverName?: string | null,
    platform?: string | null,
  ): MediaServerStatus {
    return {
      machineId,
      version,
      name: serverName || undefined,
      platform: platform || undefined,
    };
  }

  // ============================================================
  // HELPER CONVERTERS
  // ============================================================

  private static toMediaSources(
    sources?: MediaSourceInfo[] | null,
  ): MediaSource[] {
    if (!sources || !Array.isArray(sources)) {
      return [];
    }

    return sources.map((source) => {
      const videoStream = source.MediaStreams?.find(
        (s) => s.Type === 'Video',
      );
      const audioStream = source.MediaStreams?.find(
        (s) => s.Type === 'Audio',
      );

      return {
        id: source.Id || '',
        duration: source.RunTimeTicks
          ? Math.floor(source.RunTimeTicks / JELLYFIN_TICKS_PER_MS)
          : 0,
        bitrate: source.Bitrate || undefined,
        width: videoStream?.Width || undefined,
        height: videoStream?.Height || undefined,
        aspectRatio: videoStream?.AspectRatio
          ? parseFloat(videoStream.AspectRatio)
          : undefined,
        audioChannels: audioStream?.Channels || undefined,
        audioCodec: audioStream?.Codec || undefined,
        videoCodec: videoStream?.Codec || undefined,
        videoResolution: videoStream?.Width
          ? `${videoStream.Width}x${videoStream.Height}`
          : undefined,
        container: source.Container || undefined,
      };
    });
  }

  private static toMediaGenres(
    genres?: string[] | null,
  ): MediaGenre[] {
    if (!genres || !Array.isArray(genres)) {
      return [];
    }

    return genres.map((genre, index) => ({
      id: index,
      name: genre,
    }));
  }

  private static toMediaActors(
    people?: BaseItemDto['People'],
  ): MediaActor[] {
    if (!people || !Array.isArray(people)) {
      return [];
    }

    return people
      .filter((person) => person.Type === 'Actor')
      .map((actor) => ({
        id: actor.Id || undefined,
        name: actor.Name || '',
        role: actor.Role || undefined,
        thumb: actor.PrimaryImageTag
          ? `/Items/${actor.Id}/Images/Primary`
          : undefined,
      }));
  }

  private static toMediaRatings(item: BaseItemDto): MediaRating[] {
    const ratings: MediaRating[] = [];

    if (item.CommunityRating !== undefined && item.CommunityRating !== null) {
      ratings.push({
        source: 'community',
        value: item.CommunityRating,
        type: 'audience',
      });
    }

    if (item.CriticRating !== undefined && item.CriticRating !== null) {
      ratings.push({
        source: 'critic',
        value: item.CriticRating / 10, // Jellyfin uses 0-100, normalize to 0-10
        type: 'critic',
      });
    }

    return ratings;
  }
}
