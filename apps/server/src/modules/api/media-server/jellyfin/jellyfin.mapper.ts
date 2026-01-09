import {
  type BaseItemDto,
  BaseItemKind,
  type MediaSourceInfo,
  type UserDto,
} from '@jellyfin/sdk/lib/generated-client/models';
import {
  type MediaActor,
  type MediaCollection,
  type MediaGenre,
  type MediaItem,
  type MediaItemType,
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

export class JellyfinMapper {
  static toMediaItemType(kind?: BaseItemKind | string): MediaItemType {
    switch (kind) {
      case BaseItemKind.Movie:
      case 'Movie':
        return 'movie';
      case BaseItemKind.Series:
      case 'Series':
        return 'show';
      case BaseItemKind.Season:
      case 'Season':
        return 'season';
      case BaseItemKind.Episode:
      case 'Episode':
        return 'episode';
      default:
        return 'movie';
    }
  }

  /**
   * Convert MediaItemType to Jellyfin BaseItemKind.
   */
  static toBaseItemKind(type: MediaItemType): BaseItemKind {
    switch (type) {
      case 'movie':
        return BaseItemKind.Movie;
      case 'show':
        return BaseItemKind.Series;
      case 'season':
        return BaseItemKind.Season;
      case 'episode':
        return BaseItemKind.Episode;
      default:
        return BaseItemKind.Movie;
    }
  }

  /**
   * Convert multiple MediaItemType values to BaseItemKind array.
   */
  static toBaseItemKinds(types?: MediaItemType[]): BaseItemKind[] {
    if (!types?.length) {
      return [BaseItemKind.Movie, BaseItemKind.Series];
    }
    return types.map((type) => JellyfinMapper.toBaseItemKind(type));
  }

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
    const result: MediaProviderIds = {
      imdb: [],
      tmdb: [],
      tvdb: [],
    };

    if (!providerIds) {
      return result;
    }

    // Jellyfin uses capitalized keys
    if (providerIds.Imdb) {
      result.imdb.push(providerIds.Imdb);
    }
    if (providerIds.Tmdb) {
      result.tmdb.push(providerIds.Tmdb);
    }
    if (providerIds.Tvdb) {
      result.tvdb.push(providerIds.Tvdb);
    }

    return result;
  }

  /**
   * Determine the correct parent ID for a Jellyfin item.
   *
   * Jellyfin's parent hierarchy differs from Plex:
   * - For Seasons: ParentId = library folder, SeriesId = show
   * - For Episodes: ParentId = season, SeriesId = show
   * - For Movies/Shows: ParentId = library folder
   *
   * To maintain consistent behavior with Plex (where parentId of a season
   * is the show), we use SeriesId as parentId for seasons.
   */
  private static getParentId(item: BaseItemDto): string | undefined {
    const itemType = JellyfinMapper.toMediaItemType(item.Type);

    // For seasons, the "parent" should be the show (SeriesId), not the library (ParentId)
    if (itemType === 'season') {
      return item.SeriesId || item.ParentId || undefined;
    }

    // For episodes, Jellyfin provides SeasonId for the parent season.
    // ParentId may refer to the series or library depending on context.
    if (itemType === 'episode') {
      return (
        (item as unknown as { SeasonId?: string }).SeasonId ||
        item.ParentId ||
        undefined
      );
    }

    // For all other types, use the standard ParentId
    return item.ParentId || undefined;
  }

  /**
   * Determine the correct grandparent ID for a Jellyfin item.
   *
   * Jellyfin hierarchy:
   * - Episodes: grandparent = show (SeriesId)
   * - Seasons: no grandparent (parent is show, so grandparent would be library - not useful)
   * - Movies/Shows: no grandparent
   */
  private static getGrandparentId(item: BaseItemDto): string | undefined {
    const itemType = JellyfinMapper.toMediaItemType(item.Type);

    // Only episodes have a meaningful grandparent (the show)
    if (itemType === 'episode') {
      return item.SeriesId || undefined;
    }

    // Seasons, movies, and shows don't have a useful grandparent
    return undefined;
  }

  /**
   * Convert a Jellyfin BaseItemDto to a MediaItem.
   */
  static toMediaItem(item: BaseItemDto): MediaItem {
    const parentId = JellyfinMapper.getParentId(item);
    const grandparentId = JellyfinMapper.getGrandparentId(item);

    return {
      id: item.Id || '',
      parentId: parentId,
      grandparentId: grandparentId,
      title: item.Name || '',
      parentTitle: item.SeasonName || item.SeriesName || undefined,
      grandparentTitle: item.SeriesName || undefined,
      guid: item.Id || '', // Jellyfin uses Id as guid
      parentGuid: parentId,
      grandparentGuid: grandparentId,
      type: JellyfinMapper.toMediaItemType(item.Type),
      addedAt: item.DateCreated ? new Date(item.DateCreated) : new Date(),
      updatedAt: (item as { DateLastSaved?: string }).DateLastSaved
        ? new Date((item as { DateLastSaved?: string }).DateLastSaved!)
        : undefined,
      providerIds: JellyfinMapper.extractProviderIds(item.ProviderIds),
      mediaSources: JellyfinMapper.toMediaSources(item.MediaSources),
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
      ratings: JellyfinMapper.toMediaRatings(item),
      userRating: item.UserData?.Rating || undefined,
      genres: JellyfinMapper.toMediaGenres(item.Genres),
      actors: JellyfinMapper.toMediaActors(item.People),
      childCount: item.ChildCount || undefined,
      watchedChildCount: item.UserData?.PlayedPercentage
        ? Math.floor(
            (item.ChildCount || 0) * (item.UserData.PlayedPercentage / 100),
          )
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
      type: JellyfinMapper.toLibraryType(item.CollectionType),
      agent: undefined, // Jellyfin doesn't expose agent info
    };
  }

  /**
   * Convert Jellyfin collection type to library type.
   */
  static toLibraryType(collectionType?: string | null): 'movie' | 'show' {
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
    url?: string | null,
  ): MediaServerStatus {
    return {
      machineId,
      version,
      name: serverName || undefined,
      platform: platform || undefined,
      url: url || undefined,
    };
  }

  private static toMediaSources(
    sources?: MediaSourceInfo[] | null,
  ): MediaSource[] {
    if (!sources || !Array.isArray(sources)) {
      return [];
    }

    return sources.map((source) => {
      const videoStream = source.MediaStreams?.find((s) => s.Type === 'Video');
      const audioStream = source.MediaStreams?.find((s) => s.Type === 'Audio');

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

  private static toMediaGenres(genres?: string[] | null): MediaGenre[] {
    if (!genres || !Array.isArray(genres)) {
      return [];
    }

    return genres.map((genre, index) => ({
      id: index,
      name: genre,
    }));
  }

  private static toMediaActors(people?: BaseItemDto['People']): MediaActor[] {
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
