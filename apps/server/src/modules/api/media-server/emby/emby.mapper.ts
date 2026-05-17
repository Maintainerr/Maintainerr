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
import { EMBY_TICKS_PER_MS } from './emby.constants';
import type {
  EmbyBaseItemDto,
  EmbyMediaSource,
  EmbyPerson,
  EmbyProviderIds,
  EmbyUserDto,
} from './emby.types';

interface EmbyItemDtoWithExtras extends EmbyBaseItemDto {
  DateLastSaved?: string;
  CriticRating?: number;
}

export class EmbyMapper {
  static toMediaItemType(kind?: string): MediaItemType {
    switch (kind) {
      case 'Movie':
        return 'movie';
      case 'Series':
        return 'show';
      case 'Season':
        return 'season';
      case 'Episode':
        return 'episode';
      default:
        return 'movie';
    }
  }

  static toEmbyItemKind(type: MediaItemType): string {
    switch (type) {
      case 'movie':
        return 'Movie';
      case 'show':
        return 'Series';
      case 'season':
        return 'Season';
      case 'episode':
        return 'Episode';
      default:
        return 'Movie';
    }
  }

  static toEmbyItemKinds(types?: MediaItemType[]): string[] {
    if (!types?.length) {
      return ['Movie', 'Series'];
    }
    return types.map((type) => EmbyMapper.toEmbyItemKind(type));
  }

  /**
   * Emby stores provider IDs with capitalized keys, identical to Jellyfin.
   */
  static extractProviderIds(
    providerIds?: EmbyProviderIds | null,
  ): MediaProviderIds {
    const result: MediaProviderIds = {
      imdb: [],
      tmdb: [],
      tvdb: [],
    };

    if (!providerIds) {
      return result;
    }

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
   * Maintain Plex-consistent parent semantics:
   * - Season's parent is the show (SeriesId), not the library
   * - Episode's parent is the season (SeasonId)
   * - Other items use ParentId
   */
  private static getParentId(item: EmbyBaseItemDto): string | undefined {
    const itemType = EmbyMapper.toMediaItemType(item.Type);

    if (itemType === 'season') {
      return item.SeriesId || item.ParentId || undefined;
    }

    if (itemType === 'episode') {
      return item.SeasonId || item.ParentId || undefined;
    }

    return item.ParentId || undefined;
  }

  private static getGrandparentId(item: EmbyBaseItemDto): string | undefined {
    const itemType = EmbyMapper.toMediaItemType(item.Type);

    if (itemType === 'episode') {
      return item.SeriesId || undefined;
    }

    return undefined;
  }

  static toMediaItem(item: EmbyBaseItemDto): MediaItem {
    const parentId = EmbyMapper.getParentId(item);
    const grandparentId = EmbyMapper.getGrandparentId(item);
    const extras = item as EmbyItemDtoWithExtras;

    return {
      id: item.Id || '',
      parentId: parentId,
      grandparentId: grandparentId,
      title: item.Name || '',
      parentTitle: item.SeasonName || item.SeriesName || undefined,
      grandparentTitle: item.SeriesName || undefined,
      guid: item.Id || '',
      parentGuid: parentId,
      grandparentGuid: grandparentId,
      type: EmbyMapper.toMediaItemType(item.Type),
      addedAt: item.DateCreated ? new Date(item.DateCreated) : new Date(),
      updatedAt: extras.DateLastSaved
        ? new Date(extras.DateLastSaved)
        : undefined,
      providerIds: EmbyMapper.extractProviderIds(item.ProviderIds),
      mediaSources: EmbyMapper.toMediaSources(item.MediaSources),
      library: {
        id: item.ParentId || '',
        title: '',
      },
      summary: item.Overview || undefined,
      viewCount: item.UserData?.PlayCount || undefined,
      skipCount: undefined,
      lastViewedAt: item.UserData?.LastPlayedDate
        ? new Date(item.UserData.LastPlayedDate)
        : undefined,
      year: item.ProductionYear || undefined,
      durationMs: item.RunTimeTicks
        ? Math.floor(item.RunTimeTicks / EMBY_TICKS_PER_MS)
        : undefined,
      originallyAvailableAt: item.PremiereDate
        ? new Date(item.PremiereDate)
        : undefined,
      contentRating: item.OfficialRating || undefined,
      ratings: EmbyMapper.toMediaRatings(item),
      userRating: undefined,
      genres: EmbyMapper.toMediaGenres(item.Genres),
      actors: EmbyMapper.toMediaActors(item.People),
      childCount: item.ChildCount || undefined,
      watchedChildCount: undefined,
      index: item.IndexNumber ?? undefined,
      indexEnd: item.IndexNumberEnd ?? undefined,
      parentIndex: item.ParentIndexNumber ?? undefined,
      collections: undefined,
      labels: item.Tags || undefined,
    };
  }

  static toMediaLibrary(item: EmbyBaseItemDto): MediaLibrary {
    return {
      id: item.Id || '',
      title: item.Name || '',
      type: EmbyMapper.toLibraryType(item.CollectionType),
      agent: undefined,
    };
  }

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

  static toMediaUser(user: EmbyUserDto): MediaUser {
    return {
      id: user.Id || '',
      name: user.Name || '',
      thumb: user.PrimaryImageTag
        ? `/Users/${user.Id}/Images/Primary`
        : undefined,
    };
  }

  static toWatchRecord(
    userId: string,
    itemId: string,
    lastPlayedDate?: Date,
    progress?: number,
  ): WatchRecord {
    return {
      userId,
      itemId,
      watchedAt: lastPlayedDate,
      progress: progress ?? 100,
    };
  }

  static toMediaCollection(item: EmbyBaseItemDto): MediaCollection {
    const extras = item as EmbyItemDtoWithExtras;
    return {
      id: item.Id || '',
      title: item.Name || '',
      summary: item.Overview || undefined,
      thumb: item.ImageTags?.Primary
        ? `/Items/${item.Id}/Images/Primary`
        : undefined,
      childCount: item.ChildCount || 0,
      addedAt: item.DateCreated ? new Date(item.DateCreated) : undefined,
      updatedAt: extras.DateLastSaved
        ? new Date(extras.DateLastSaved)
        : undefined,
      // TODO(emby-server-test): Emby retains "Smart Collections" as a paid
      // feature. Set this based on Type === 'BoxSet' vs. 'SmartCollection' or
      // similar once verified against a Premiere-enabled server.
      smart: false,
      libraryId: item.ParentId || undefined,
    };
  }

  static toMediaPlaylist(item: EmbyBaseItemDto): MediaPlaylist {
    const extras = item as EmbyItemDtoWithExtras;
    return {
      id: item.Id || '',
      title: item.Name || '',
      summary: item.Overview || undefined,
      smart: false,
      itemCount: item.ChildCount || 0,
      durationMs: item.RunTimeTicks
        ? Math.floor(item.RunTimeTicks / EMBY_TICKS_PER_MS)
        : undefined,
      addedAt: item.DateCreated ? new Date(item.DateCreated) : undefined,
      updatedAt: extras.DateLastSaved
        ? new Date(extras.DateLastSaved)
        : undefined,
    };
  }

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
    sources?: EmbyMediaSource[] | null,
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
          ? Math.floor(source.RunTimeTicks / EMBY_TICKS_PER_MS)
          : 0,
        bitrate: source.Bitrate || undefined,
        width: videoStream?.Width || undefined,
        height: videoStream?.Height || undefined,
        aspectRatio: videoStream?.AspectRatio
          ? videoStream.AspectRatio.includes(':')
            ? parseFloat(videoStream.AspectRatio.split(':')[0]) /
              parseFloat(videoStream.AspectRatio.split(':')[1])
            : parseFloat(videoStream.AspectRatio)
          : undefined,
        audioChannels: audioStream?.Channels || undefined,
        audioCodec: audioStream?.Codec || undefined,
        videoCodec: videoStream?.Codec || undefined,
        videoResolution: videoStream?.Width
          ? `${videoStream.Width}x${videoStream.Height}`
          : undefined,
        container: source.Container || undefined,
        sizeBytes: source.Size || undefined,
      };
    });
  }

  private static toMediaGenres(genres?: string[] | null): MediaGenre[] {
    if (!genres || !Array.isArray(genres)) {
      return [];
    }

    return genres.map((genre) => ({
      id: EmbyMapper.hashString(genre),
      name: genre,
    }));
  }

  private static hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  }

  private static toMediaActors(people?: EmbyPerson[] | null): MediaActor[] {
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

  private static toMediaRatings(item: EmbyBaseItemDto): MediaRating[] {
    const ratings: MediaRating[] = [];
    const extras = item as EmbyItemDtoWithExtras;

    if (item.CommunityRating !== undefined && item.CommunityRating !== null) {
      ratings.push({
        source: 'community',
        value: item.CommunityRating,
        type: 'audience',
      });
    }

    if (extras.CriticRating !== undefined && extras.CriticRating !== null) {
      ratings.push({
        source: 'critic',
        value: extras.CriticRating / 10,
        type: 'critic',
      });
    }

    return ratings;
  }
}
