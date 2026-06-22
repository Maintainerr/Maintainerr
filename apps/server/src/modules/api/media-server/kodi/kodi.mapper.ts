import {
  type MediaItem,
  type MediaItemType,
  type MediaProviderIds,
  type MediaServerStatus,
  type MediaSource,
  type WatchRecord,
} from '@maintainerr/contracts';
import {
  KODI_COLLECTION_TAG_PREFIX,
  KODI_LIBRARIES,
} from './kodi.constants';
import type {
  KodiCast,
  KodiEpisode,
  KodiMovie,
  KodiSeason,
  KodiStreamDetails,
  KodiTVShow,
  KodiUniqueId,
} from './kodi.types';

/**
 * Kodi library IDs are per-type integers (movieid/tvshowid/seasonid/episodeid
 * all start at 1 and overlap), so a bare number is ambiguous. The adapter wraps
 * every item ID as `<type>-<id>` and unwraps it before each JSON-RPC call. This
 * file is type-conversion only — no I/O, no business logic.
 */
export class KodiMapper {
  // ---- Composite item IDs -------------------------------------------------

  static encodeItemId(type: MediaItemType, numericId: number): string {
    return `${type}-${numericId}`;
  }

  static decodeItemId(id: string): { type: MediaItemType; numericId: number } {
    const sep = id.indexOf('-');
    if (sep <= 0) {
      throw new Error(`Invalid Kodi item id: ${id}`);
    }
    const type = id.slice(0, sep) as MediaItemType;
    const numericId = Number(id.slice(sep + 1));
    if (!Number.isInteger(numericId)) {
      throw new Error(`Invalid Kodi item id: ${id}`);
    }
    return { type, numericId };
  }

  static libraryForType(type: MediaItemType): { id: string; title: string } {
    return type === 'movie'
      ? { id: KODI_LIBRARIES.MOVIES.id, title: KODI_LIBRARIES.MOVIES.title }
      : { id: KODI_LIBRARIES.TVSHOWS.id, title: KODI_LIBRARIES.TVSHOWS.title };
  }

  // ---- Provider IDs -------------------------------------------------------

  /** Kodi's uniqueid map keys are scraper-dependent; normalise the common three. */
  static extractProviderIds(uniqueid?: KodiUniqueId | null): MediaProviderIds {
    const result: MediaProviderIds = { imdb: [], tmdb: [], tvdb: [] };
    if (!uniqueid) return result;
    if (uniqueid.imdb) result.imdb.push(uniqueid.imdb);
    if (uniqueid.tmdb) result.tmdb.push(uniqueid.tmdb);
    if (uniqueid.tvdb) result.tvdb.push(uniqueid.tvdb);
    return result;
  }

  // ---- Items --------------------------------------------------------------

  static toMovie(item: KodiMovie): MediaItem {
    return {
      id: KodiMapper.encodeItemId('movie', item.movieid),
      title: item.title || item.label || '',
      guid: KodiMapper.encodeItemId('movie', item.movieid),
      type: 'movie',
      addedAt: KodiMapper.parseDate(item.dateadded) ?? new Date(),
      providerIds: KodiMapper.extractProviderIds(item.uniqueid),
      mediaSources: KodiMapper.toMediaSources(item.streamdetails),
      library: KodiMapper.libraryForType('movie'),
      summary: item.plot || undefined,
      viewCount: item.playcount || undefined,
      lastViewedAt: KodiMapper.parseDate(item.lastplayed) ?? undefined,
      year: item.year || undefined,
      durationMs: item.runtime ? item.runtime * 1000 : undefined,
      originallyAvailableAt:
        KodiMapper.parseDate(item.premiered) ?? undefined,
      ratings:
        item.rating != null
          ? [{ source: 'community', value: item.rating, type: 'audience' }]
          : [],
      userRating: item.userrating || undefined,
      genres: KodiMapper.toGenres(item.genre),
      actors: KodiMapper.toActors(item.cast),
      labels: KodiMapper.userTags(item.tag),
    };
  }

  static toTVShow(item: KodiTVShow): MediaItem {
    return {
      id: KodiMapper.encodeItemId('show', item.tvshowid),
      title: item.title || item.label || '',
      guid: KodiMapper.encodeItemId('show', item.tvshowid),
      type: 'show',
      addedAt: KodiMapper.parseDate(item.dateadded) ?? new Date(),
      providerIds: KodiMapper.extractProviderIds(item.uniqueid),
      mediaSources: [],
      library: KodiMapper.libraryForType('show'),
      summary: item.plot || undefined,
      viewCount: item.playcount || undefined,
      lastViewedAt: KodiMapper.parseDate(item.lastplayed) ?? undefined,
      year: item.year || undefined,
      originallyAvailableAt:
        KodiMapper.parseDate(item.premiered) ?? undefined,
      ratings:
        item.rating != null
          ? [{ source: 'community', value: item.rating, type: 'audience' }]
          : [],
      userRating: item.userrating || undefined,
      genres: KodiMapper.toGenres(item.genre),
      actors: KodiMapper.toActors(item.cast),
      childCount: item.episode || undefined,
      watchedChildCount: item.watchedepisodes || undefined,
      labels: KodiMapper.userTags(item.tag),
    };
  }

  static toSeason(item: KodiSeason): MediaItem {
    const showId =
      item.tvshowid != null
        ? KodiMapper.encodeItemId('show', item.tvshowid)
        : undefined;
    return {
      id: KodiMapper.encodeItemId('season', item.seasonid),
      parentId: showId,
      grandparentId: undefined,
      title: item.title || item.label || '',
      parentTitle: item.showtitle || undefined,
      guid: KodiMapper.encodeItemId('season', item.seasonid),
      parentGuid: showId,
      type: 'season',
      addedAt: new Date(),
      providerIds: { imdb: [], tmdb: [], tvdb: [] },
      mediaSources: [],
      library: KodiMapper.libraryForType('season'),
      viewCount: item.playcount || undefined,
      childCount: item.episode || undefined,
      watchedChildCount: item.watchedepisodes || undefined,
      parentIndex: item.season ?? undefined,
      index: item.season ?? undefined,
    };
  }

  static toEpisode(item: KodiEpisode): MediaItem {
    const showId =
      item.tvshowid != null
        ? KodiMapper.encodeItemId('show', item.tvshowid)
        : undefined;
    const seasonId =
      item.seasonid != null
        ? KodiMapper.encodeItemId('season', item.seasonid)
        : undefined;
    return {
      id: KodiMapper.encodeItemId('episode', item.episodeid),
      parentId: seasonId,
      grandparentId: showId,
      title: item.title || item.label || '',
      parentTitle: undefined,
      grandparentTitle: item.showtitle || undefined,
      guid: KodiMapper.encodeItemId('episode', item.episodeid),
      parentGuid: seasonId,
      grandparentGuid: showId,
      type: 'episode',
      addedAt: KodiMapper.parseDate(item.dateadded) ?? new Date(),
      providerIds: KodiMapper.extractProviderIds(item.uniqueid),
      mediaSources: KodiMapper.toMediaSources(item.streamdetails),
      library: KodiMapper.libraryForType('episode'),
      summary: item.plot || undefined,
      viewCount: item.playcount || undefined,
      lastViewedAt: KodiMapper.parseDate(item.lastplayed) ?? undefined,
      originallyAvailableAt:
        KodiMapper.parseDate(item.firstaired) ?? undefined,
      ratings:
        item.rating != null
          ? [{ source: 'community', value: item.rating, type: 'audience' }]
          : [],
      userRating: item.userrating || undefined,
      index: item.episode ?? undefined,
      parentIndex: item.season ?? undefined,
    };
  }

  static toWatchRecord(
    userId: string,
    itemId: string,
    watchedAt?: Date,
  ): WatchRecord {
    return { userId, itemId, watchedAt, progress: 100 };
  }

  static toMediaServerStatus(
    machineId: string,
    version: string,
    name?: string,
    url?: string,
  ): MediaServerStatus {
    return {
      machineId,
      version,
      name: name || undefined,
      platform: 'Kodi',
      url: url || undefined,
    };
  }

  // ---- Collection tag helpers --------------------------------------------

  /** Drop Maintainerr-managed tags from the user-facing label list. */
  static userTags(tags?: string[] | null): string[] | undefined {
    if (!tags?.length) return undefined;
    const visible = tags.filter(
      (t) => !t.startsWith(KODI_COLLECTION_TAG_PREFIX),
    );
    return visible.length ? visible : undefined;
  }

  // ---- Internal conversions ----------------------------------------------

  /** Kodi datetimes are `YYYY-MM-DD HH:MM:SS` (local) or empty when unset. */
  static parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private static toGenres(genres?: string[] | null) {
    if (!genres?.length) return [];
    return genres.map((name) => ({ id: KodiMapper.hashString(name), name }));
  }

  private static toActors(cast?: KodiCast[] | null) {
    if (!cast?.length) return [];
    return cast.map((c) => ({
      name: c.name || '',
      role: c.role || undefined,
      thumb: c.thumbnail || undefined,
    }));
  }

  private static toMediaSources(stream?: KodiStreamDetails | null): MediaSource[] {
    const video = stream?.video?.[0];
    const audio = stream?.audio?.[0];
    if (!video && !audio) return [];
    return [
      {
        id: '',
        duration: video?.duration ? video.duration * 1000 : 0,
        width: video?.width || undefined,
        height: video?.height || undefined,
        aspectRatio: video?.aspect || undefined,
        audioChannels: audio?.channels || undefined,
        audioCodec: audio?.codec || undefined,
        videoCodec: video?.codec || undefined,
        videoResolution: KodiMapper.toResolutionName(video?.height),
      },
    ];
  }

  /** Map pixel height to the named resolution rules compare against (4k, 1080…). */
  private static toResolutionName(height?: number): string | undefined {
    if (!height) return undefined;
    if (height >= 2000) return '4k';
    if (height >= 1440) return '1440';
    if (height >= 1080) return '1080';
    if (height >= 720) return '720';
    if (height >= 480) return '480';
    return String(height);
  }

  private static hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return hash >>> 0;
  }
}
