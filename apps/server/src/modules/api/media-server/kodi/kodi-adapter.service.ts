import {
  MediaServerFeature,
  MediaServerType,
  type CollectionVisibilitySettings,
  type CreateCollectionParams,
  type LibraryQueryOptions,
  type MediaCollection,
  type MediaItem,
  type MediaItemType,
  type MediaLibrary,
  type MediaPlaylist,
  type MediaServerStatus,
  type MediaUser,
  type PagedResult,
  type RecentlyAddedOptions,
  type UpdateCollectionParams,
  type WatchRecord,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { formatConnectionFailureMessage } from '../../../../utils/connection-error';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsDataService } from '../../../settings/settings-data.service';
import { KodiApi, KodiRpcError } from '../../kodi-api/kodi-api.helper';
import cacheManager, { type Cache } from '../../lib/cache';
import { supportsFeature } from '../media-server.constants';
import type {
  IMediaServerService,
  MediaWatchState,
} from '../media-server.interface';
import {
  KodiCollection,
  KodiCollectionMember,
} from './kodi-collection.entities';
import {
  KODI_CACHE_KEYS,
  KODI_CACHE_TTL,
  KODI_COLLECTION_TAG_PREFIX,
  KODI_EPISODE_PROPERTIES,
  KODI_LIBRARIES,
  KODI_MOVIE_PROPERTIES,
  KODI_PAGE_SIZE,
  KODI_SEASON_PROPERTIES,
  KODI_TVSHOW_PROPERTIES,
  KODI_USER,
} from './kodi.constants';
import { KodiMapper } from './kodi.mapper';
import type {
  KodiApplicationProperties,
  KodiActivePlayer,
  KodiEpisodeDetailsResult,
  KodiEpisodesResult,
  KodiMovieDetailsResult,
  KodiMoviesResult,
  KodiPlayerItemResult,
  KodiSeason,
  KodiSeasonDetailsResult,
  KodiSeasonsResult,
  KodiTagsResult,
  KodiTVShowDetailsResult,
  KodiTVShowsResult,
} from './kodi.types';

/** JSON-RPC "Invalid params." — Kodi's signal that a library id does not exist. */
const KODI_INVALID_PARAMS = -32602;

/**
 * Kodi media server adapter.
 *
 * Implements IMediaServerService against Kodi's JSON-RPC API (Kodi 21 "Omega",
 * v13). Kodi is a single-user player, not a multi-user server, so several
 * contract concepts are synthesized honestly rather than faked:
 * - Users: one synthetic user (no multi-user model over JSON-RPC).
 * - Libraries: two virtual libraries (movies, tvshows) — Kodi has no sections.
 * - Watch state: install-wide playcount/lastplayed (no central/multi-user history).
 * - Collections: tag-backed for movies/shows (visible in Kodi); a Maintainerr
 *   shadow index for seasons/episodes (Kodi has no writable tag on those).
 * - Deletion: Kodi cannot delete files over JSON-RPC, so deleteFromDisk fails
 *   loud — deletion requires a configured Radarr/Sonarr.
 */
@Injectable()
export class KodiAdapterService implements IMediaServerService {
  private client: KodiApi | undefined;
  private initialized = false;
  private kodiUrl: string | undefined;
  private readonly cache: Cache;

  constructor(
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
    @InjectRepository(KodiCollection)
    private readonly collectionRepo: Repository<KodiCollection>,
    @InjectRepository(KodiCollectionMember)
    private readonly memberRepo: Repository<KodiCollectionMember>,
  ) {
    this.logger.setContext(KodiAdapterService.name);
    this.cache = cacheManager.getCache('kodi');
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    const url = this.settings.kodi_url;
    const username = this.settings.kodi_username;
    const password = this.settings.kodi_password;

    if (!url || !username) {
      this.logger.debug(
        'Kodi settings incomplete — skipping initialize (url or username missing)',
      );
      this.initialized = false;
      this.client = undefined;
      return;
    }

    let cleanUrl = url;
    while (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    this.kodiUrl = cleanUrl;
    this.client = new KodiApi({
      url: cleanUrl,
      username,
      password: password ?? '',
    });

    try {
      const pong = await this.client.call<string>('JSONRPC.Ping');
      this.initialized = pong === 'pong';
      if (this.initialized) {
        this.logger.log(`Kodi connection established to ${this.kodiUrl}`);
      } else {
        this.logger.warn(`Kodi ping returned unexpected response: ${pong}`);
      }
    } catch (error) {
      this.initialized = false;
      this.logger.warn(
        `Failed to initialize Kodi connection: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
    }
  }

  uninitialize(): void {
    this.client = undefined;
    this.initialized = false;
    this.kodiUrl = undefined;
    this.cache.flush();
  }

  isSetup(): boolean {
    return this.initialized && this.client !== undefined;
  }

  getServerType(): MediaServerType {
    return MediaServerType.KODI;
  }

  supportsFeature(feature: MediaServerFeature): boolean {
    return supportsFeature(MediaServerType.KODI, feature);
  }

  // ============================================================================
  // Server / Users
  // ============================================================================

  async getStatus(): Promise<MediaServerStatus | undefined> {
    if (!this.client) return undefined;
    try {
      const cached = this.cache.data.get<KodiApplicationProperties>(
        KODI_CACHE_KEYS.STATUS,
      );
      const props =
        cached ??
        (await this.client.call<KodiApplicationProperties>(
          'Application.GetProperties',
          { properties: ['version', 'name'] },
        ));
      if (!cached) {
        this.cache.data.set(
          KODI_CACHE_KEYS.STATUS,
          props,
          KODI_CACHE_TTL.STATUS,
        );
      }
      const v = props.version;
      const version = v ? `${v.major}.${v.minor}` : 'unknown';
      return KodiMapper.toMediaServerStatus(
        this.kodiUrl ?? 'kodi',
        version,
        props.name ?? 'Kodi',
        this.kodiUrl,
      );
    } catch (error) {
      this.logger.debug(
        `Kodi getStatus failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return undefined;
    }
  }

  // Kodi has no multi-user model over JSON-RPC; present one synthetic user so
  // single-user watch state has a stable identity for seenBy-style rules.
  async getUsers(): Promise<MediaUser[]> {
    return [{ id: KODI_USER.id, name: KODI_USER.name }];
  }

  async getUser(id: string): Promise<MediaUser | undefined> {
    return id === KODI_USER.id
      ? { id: KODI_USER.id, name: KODI_USER.name }
      : undefined;
  }

  // ============================================================================
  // Libraries
  // ============================================================================

  async getLibraries(): Promise<MediaLibrary[]> {
    // Kodi has no library sections — only movie and tvshow domains. Present a
    // virtual library per domain.
    return [
      {
        id: KODI_LIBRARIES.MOVIES.id,
        title: KODI_LIBRARIES.MOVIES.title,
        type: KODI_LIBRARIES.MOVIES.type,
      },
      {
        id: KODI_LIBRARIES.TVSHOWS.id,
        title: KODI_LIBRARIES.TVSHOWS.title,
        type: KODI_LIBRARIES.TVSHOWS.type,
      },
    ];
  }

  // Kodi exposes no per-library byte totals over JSON-RPC (no file-size field),
  // so both storage paths return an empty map — callers treat libraries as
  // un-sized rather than zero-sized.
  async getLibrariesStorage(): Promise<Map<string, number>> {
    return new Map();
  }

  async computeLibraryStorageSizes(): Promise<Map<string, number>> {
    return new Map();
  }

  async getLibraryContents(
    libraryId: string,
    options?: LibraryQueryOptions,
  ): Promise<PagedResult<MediaItem>> {
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? KODI_PAGE_SIZE.DEFAULT;
    if (!this.client) return { items: [], totalSize: 0, offset, limit };

    const type = options?.type ?? this.defaultTypeForLibrary(libraryId);
    const sort = this.toKodiSort(options?.sort, options?.sortOrder);

    try {
      if (type === 'season') {
        // No "all seasons" call — enumerate per show, then slice for paging.
        const seasons = await this.fetchAllSeasons();
        const page = seasons.slice(offset, offset + limit);
        return {
          items: page.map((s) => KodiMapper.toSeason(s)),
          totalSize: seasons.length,
          offset,
          limit,
        };
      }

      const window = { start: offset, end: offset + limit };
      if (type === 'movie') {
        const res = await this.client.call<KodiMoviesResult>(
          'VideoLibrary.GetMovies',
          { properties: [...KODI_MOVIE_PROPERTIES], limits: window, sort },
        );
        return {
          items: (res.movies ?? []).map((m) => KodiMapper.toMovie(m)),
          totalSize: res.limits.total,
          offset,
          limit,
        };
      }
      if (type === 'episode') {
        const res = await this.client.call<KodiEpisodesResult>(
          'VideoLibrary.GetEpisodes',
          { properties: [...KODI_EPISODE_PROPERTIES], limits: window, sort },
        );
        return {
          items: (res.episodes ?? []).map((e) => KodiMapper.toEpisode(e)),
          totalSize: res.limits.total,
          offset,
          limit,
        };
      }
      const res = await this.client.call<KodiTVShowsResult>(
        'VideoLibrary.GetTVShows',
        { properties: [...KODI_TVSHOW_PROPERTIES], limits: window, sort },
      );
      return {
        items: (res.tvshows ?? []).map((s) => KodiMapper.toTVShow(s)),
        totalSize: res.limits.total,
        offset,
        limit,
      };
    } catch (error) {
      this.logger.warn(
        `Kodi getLibraryContents(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return { items: [], totalSize: 0, offset, limit };
    }
  }

  async getLibraryContentCount(
    libraryId: string,
    type?: MediaItemType,
  ): Promise<number> {
    if (!this.client) return 0;
    const kind = type ?? this.defaultTypeForLibrary(libraryId);
    try {
      if (kind === 'season') {
        return (await this.fetchAllSeasons()).length;
      }
      const empty = { start: 0, end: 0 };
      if (kind === 'movie') {
        const res = await this.client.call<KodiMoviesResult>(
          'VideoLibrary.GetMovies',
          { limits: empty },
        );
        return res.limits.total;
      }
      if (kind === 'episode') {
        const res = await this.client.call<KodiEpisodesResult>(
          'VideoLibrary.GetEpisodes',
          { limits: empty },
        );
        return res.limits.total;
      }
      const res = await this.client.call<KodiTVShowsResult>(
        'VideoLibrary.GetTVShows',
        { limits: empty },
      );
      return res.limits.total;
    } catch (error) {
      this.logger.debug(
        `Kodi getLibraryContentCount(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return 0;
    }
  }

  async searchLibraryContents(
    libraryId: string,
    query: string,
    type?: MediaItemType,
  ): Promise<MediaItem[]> {
    if (!this.client) return [];
    const kind = type ?? this.defaultTypeForLibrary(libraryId);
    const filter = { field: 'title', operator: 'contains', value: query };
    const limits = { start: 0, end: KODI_PAGE_SIZE.DEFAULT };
    try {
      if (kind === 'movie') {
        const res = await this.client.call<KodiMoviesResult>(
          'VideoLibrary.GetMovies',
          { properties: [...KODI_MOVIE_PROPERTIES], filter, limits },
        );
        return (res.movies ?? []).map((m) => KodiMapper.toMovie(m));
      }
      if (kind === 'episode') {
        const res = await this.client.call<KodiEpisodesResult>(
          'VideoLibrary.GetEpisodes',
          { properties: [...KODI_EPISODE_PROPERTIES], filter, limits },
        );
        return (res.episodes ?? []).map((e) => KodiMapper.toEpisode(e));
      }
      const res = await this.client.call<KodiTVShowsResult>(
        'VideoLibrary.GetTVShows',
        { properties: [...KODI_TVSHOW_PROPERTIES], filter, limits },
      );
      return (res.tvshows ?? []).map((s) => KodiMapper.toTVShow(s));
    } catch (error) {
      this.logger.debug(
        `Kodi searchLibraryContents failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  // ============================================================================
  // Metadata
  // ============================================================================

  async getMetadata(itemId: string): Promise<MediaItem | undefined> {
    if (!this.client) return undefined;
    try {
      return await this.fetchItem(itemId);
    } catch (error) {
      this.logger.debug(
        `Kodi getMetadata(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return undefined;
    }
  }

  async itemExists(itemId: string): Promise<boolean> {
    if (!this.client) throw new Error('Kodi not initialized');
    try {
      const item = await this.fetchItem(itemId);
      return item !== undefined;
    } catch (error) {
      // A malformed/absent library id answers HTTP 200 with JSON-RPC -32602.
      // That is the only "definitely gone" signal; every other failure (auth,
      // network, 5xx) must throw so a live item isn't dropped on a blip.
      if (error instanceof KodiRpcError && error.code === KODI_INVALID_PARAMS) {
        return false;
      }
      throw error;
    }
  }

  async getChildrenMetadata(
    parentId: string,
    childType?: MediaItemType,
  ): Promise<MediaItem[]> {
    if (!this.client) return [];
    try {
      const { type, numericId } = KodiMapper.decodeItemId(parentId);
      if (type === 'show') {
        if (childType === 'episode') {
          const res = await this.client.call<KodiEpisodesResult>(
            'VideoLibrary.GetEpisodes',
            { tvshowid: numericId, properties: [...KODI_EPISODE_PROPERTIES] },
          );
          return (res.episodes ?? []).map((e) => KodiMapper.toEpisode(e));
        }
        const res = await this.client.call<KodiSeasonsResult>(
          'VideoLibrary.GetSeasons',
          { tvshowid: numericId, properties: [...KODI_SEASON_PROPERTIES] },
        );
        return (res.seasons ?? []).map((s) => KodiMapper.toSeason(s));
      }
      if (type === 'season') {
        const season = await this.fetchSeasonRaw(numericId);
        if (!season || season.tvshowid == null || season.season == null) {
          return [];
        }
        const res = await this.client.call<KodiEpisodesResult>(
          'VideoLibrary.GetEpisodes',
          {
            tvshowid: season.tvshowid,
            season: season.season,
            properties: [...KODI_EPISODE_PROPERTIES],
          },
        );
        return (res.episodes ?? []).map((e) => KodiMapper.toEpisode(e));
      }
      return [];
    } catch (error) {
      this.logger.debug(
        `Kodi getChildrenMetadata(${parentId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async getRecentlyAdded(
    libraryId: string,
    options?: RecentlyAddedOptions,
  ): Promise<MediaItem[]> {
    if (!this.client) return [];
    const limit = options?.limit ?? 20;
    const sort = { method: 'dateadded', order: 'descending' };
    const limits = { start: 0, end: limit };
    const kind = options?.type ?? this.defaultTypeForLibrary(libraryId);
    try {
      if (kind === 'movie') {
        const res = await this.client.call<KodiMoviesResult>(
          'VideoLibrary.GetMovies',
          { properties: [...KODI_MOVIE_PROPERTIES], sort, limits },
        );
        return (res.movies ?? []).map((m) => KodiMapper.toMovie(m));
      }
      const res = await this.client.call<KodiEpisodesResult>(
        'VideoLibrary.GetEpisodes',
        { properties: [...KODI_EPISODE_PROPERTIES], sort, limits },
      );
      return (res.episodes ?? []).map((e) => KodiMapper.toEpisode(e));
    } catch (error) {
      this.logger.debug(
        `Kodi getRecentlyAdded(${libraryId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async searchContent(query: string): Promise<MediaItem[]> {
    if (!this.client) return [];
    const [movies, shows, episodes] = await Promise.all([
      this.searchLibraryContents(KODI_LIBRARIES.MOVIES.id, query, 'movie'),
      this.searchLibraryContents(KODI_LIBRARIES.TVSHOWS.id, query, 'show'),
      this.searchLibraryContents(KODI_LIBRARIES.TVSHOWS.id, query, 'episode'),
    ]);
    return [...movies, ...shows, ...episodes];
  }

  async refreshItemMetadata(itemId: string): Promise<void> {
    if (!this.client) return;
    try {
      const { type, numericId } = KodiMapper.decodeItemId(itemId);
      const method =
        type === 'movie'
          ? 'VideoLibrary.RefreshMovie'
          : type === 'show'
            ? 'VideoLibrary.RefreshTVShow'
            : type === 'episode'
              ? 'VideoLibrary.RefreshEpisode'
              : undefined;
      if (!method) return; // Kodi has no season refresh endpoint
      const idParam =
        type === 'movie'
          ? { movieid: numericId }
          : type === 'show'
            ? { tvshowid: numericId }
            : { episodeid: numericId };
      await this.client.call(method, idParam);
    } catch (error) {
      this.logger.debug(
        `Kodi refreshItemMetadata(${itemId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
    }
  }

  // ============================================================================
  // Watch State
  // ============================================================================

  async prefetchWatchHistory(): Promise<void> {
    // Kodi exposes only per-item playcount/lastplayed; there is no central
    // history to bulk-fetch. Gated by CENTRAL_WATCH_HISTORY (false) — callers
    // shouldn't reach here.
    throw new Error(
      'Bulk watch-history prefetch is not supported on Kodi (no central history)',
    );
  }

  async getWatchHistory(itemId: string): Promise<WatchRecord[]> {
    if (!this.client) return [];
    const item = await this.fetchItem(itemId);
    if (!item || !item.viewCount || item.viewCount <= 0) return [];
    return [KodiMapper.toWatchRecord(KODI_USER.id, itemId, item.lastViewedAt)];
  }

  async getWatchState(
    itemId: string,
    nativeViewCount?: number,
  ): Promise<MediaWatchState> {
    if (!this.client) return { viewCount: 0, isWatched: false };
    const item = await this.fetchItem(itemId);
    const viewCount = item?.viewCount ?? 0;
    const isWatched =
      viewCount > 0 || (nativeViewCount !== undefined && nativeViewCount > 0);
    return { viewCount, isWatched };
  }

  async getItemSeenBy(itemId: string): Promise<string[]> {
    const history = await this.getWatchHistory(itemId);
    return history.length > 0 ? [KODI_USER.id] : [];
  }

  async getActiveSessions(): Promise<Set<string>> {
    if (!this.client) return new Set<string>();
    try {
      const players = await this.client.call<KodiActivePlayer[]>(
        'Player.GetActivePlayers',
      );
      const playing = new Set<string>();
      for (const player of players ?? []) {
        if (player.type !== 'video') continue;
        const { item } = await this.client.call<KodiPlayerItemResult>(
          'Player.GetItem',
          { playerid: player.playerid, properties: ['title'] },
        );
        if (!item || item.id == null) continue;
        // A collection can hold the episode, its season, or its show — protect
        // every level we can resolve from the now-playing item.
        if (item.type === 'movie') {
          playing.add(KodiMapper.encodeItemId('movie', item.id));
        } else if (item.type === 'episode') {
          playing.add(KodiMapper.encodeItemId('episode', item.id));
          if (item.tvshowid != null) {
            playing.add(KodiMapper.encodeItemId('show', item.tvshowid));
          }
        }
      }
      return playing;
    } catch (error) {
      this.logger.warn('Failed to fetch active Kodi sessions.');
      this.logger.debug(error);
      return new Set<string>();
    }
  }

  // Getter-support helpers the Kodi getter relies on. Kodi is single-user, so
  // multi-user watcher sets collapse to the synthetic user. (Favourites and
  // playlists are unsupported and not exposed as rule properties, so no
  // favourite/playlist helpers exist here.)

  async getTotalPlayCount(itemId: string): Promise<number> {
    const item = await this.getMetadata(itemId);
    return item?.viewCount ?? 0;
  }

  async getDescendantEpisodeWatchers(parentId: string): Promise<string[]> {
    const episodes = await this.collectDescendantEpisodes(parentId);
    const anyWatched = episodes.some((e) => (e.viewCount ?? 0) > 0);
    return anyWatched ? [KODI_USER.id] : [];
  }

  // ============================================================================
  // Collections
  // ============================================================================

  async getCollections(libraryId: string): Promise<MediaCollection[]> {
    if (!this.client) return [];
    const cacheKey = `${KODI_CACHE_KEYS.COLLECTIONS}:${libraryId}`;
    const cached = this.cache.data.get<MediaCollection[]>(cacheKey);
    if (cached) return cached;

    const collections: MediaCollection[] = [];
    try {
      // Tag-backed collections live on the library's primary item type.
      const tagType: MediaItemType =
        libraryId === KODI_LIBRARIES.MOVIES.id ? 'movie' : 'show';
      const kodiTagType = tagType === 'movie' ? 'movie' : 'tvshow';
      const res = await this.client.call<KodiTagsResult>(
        'VideoLibrary.GetTags',
        { type: kodiTagType, properties: [] },
      );
      for (const tag of res.tags ?? []) {
        if (!tag.label.startsWith(KODI_COLLECTION_TAG_PREFIX)) continue;
        const id = this.encodeTagCollectionId(tagType, tag.label);
        const childCount = await this.countTagMembers(tagType, tag.label);
        collections.push({
          id,
          title: this.tagToTitle(tag.label),
          childCount,
          smart: false,
          libraryId,
        });
      }
    } catch (error) {
      this.logger.debug(
        `Kodi getCollections(${libraryId}) tag enumeration failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
    }

    // Shadow collections (season/episode) for this library.
    const shadow = await this.collectionRepo.find({ where: { libraryId } });
    for (const c of shadow) {
      collections.push({
        id: c.id,
        title: c.title,
        summary: c.summary,
        childCount: await this.memberRepo.count({
          where: { collectionId: c.id },
        }),
        addedAt: c.addDate,
        smart: false,
        libraryId,
      });
    }
    // Skip caching empty results so a just-created collection isn't masked
    // mid-scan (mirrors the Emby adapter).
    if (collections.length > 0) {
      this.cache.data.set(cacheKey, collections, KODI_CACHE_TTL.COLLECTIONS);
    }
    return collections;
  }

  async getCollection(
    collectionId: string,
    throwOnError = false,
  ): Promise<MediaCollection | undefined> {
    try {
      if (this.isShadowCollection(collectionId)) {
        const c = await this.collectionRepo.findOne({
          where: { id: collectionId },
        });
        if (!c) return undefined;
        return {
          id: c.id,
          title: c.title,
          summary: c.summary,
          childCount: await this.memberRepo.count({
            where: { collectionId: c.id },
          }),
          addedAt: c.addDate,
          smart: false,
          libraryId: c.libraryId,
        };
      }
      const { type, tag } = this.decodeTagCollectionId(collectionId);
      const childCount = await this.countTagMembers(type, tag);
      if (childCount === 0 && !(await this.tagExists(type, tag))) {
        return undefined;
      }
      return {
        id: collectionId,
        title: this.tagToTitle(tag),
        childCount,
        smart: false,
        libraryId: KodiMapper.libraryForType(type).id,
      };
    } catch (error) {
      if (throwOnError) throw error;
      this.logger.debug(
        `Kodi getCollection(${collectionId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return undefined;
    }
  }

  async createCollection(
    params: CreateCollectionParams,
  ): Promise<MediaCollection> {
    if (!this.client) throw new Error('Kodi not initialized');

    if (params.type === 'season' || params.type === 'episode') {
      // No writable tag on seasons/episodes — back membership with the shadow
      // index. Membership is only created with ≥1 item (the collection layer
      // defers empty collections), so seed the initial member here.
      const id = `kc_shadow:${randomUUID()}`;
      await this.collectionRepo.save(
        this.collectionRepo.create({
          id,
          libraryId: params.libraryId,
          title: params.title,
          summary: params.summary,
          addDate: new Date(),
        }),
      );
      if (params.initialItemId) {
        await this.addShadowMembers(id, [params.initialItemId]);
      }
      this.invalidateCollectionsCache();
      return {
        id,
        title: params.title,
        summary: params.summary,
        childCount: params.initialItemId ? 1 : 0,
        smart: false,
        libraryId: params.libraryId,
      };
    }

    // Tag-backed (movie/show). The tag string embeds a token so the derived id
    // stays unique and stable across a rename (titles can collide / change).
    const token = Math.random().toString(36).slice(2, 8);
    const tag = `${KODI_COLLECTION_TAG_PREFIX} ${params.title} [${token}]`;
    const id = this.encodeTagCollectionId(params.type, tag);
    if (params.initialItemId) {
      const failed = await this.addTagMembers(params.type, tag, [
        params.initialItemId,
      ]);
      if (failed.length > 0) {
        throw new Error(
          `Failed to seed Kodi collection with item ${params.initialItemId}`,
        );
      }
    }
    return {
      id,
      title: params.title,
      summary: params.summary,
      childCount: params.initialItemId ? 1 : 0,
      smart: false,
      libraryId: params.libraryId,
    };
  }

  async deleteCollection(collectionId: string): Promise<void> {
    if (this.isShadowCollection(collectionId)) {
      await this.memberRepo.delete({ collectionId });
      await this.collectionRepo.delete({ id: collectionId });
      return;
    }
    if (!this.client) throw new Error('Kodi not initialized');
    const { type, tag } = this.decodeTagCollectionId(collectionId);
    const members = await this.getCollectionChildren(collectionId);
    const failed = await this.removeTagMembers(
      type,
      tag,
      members.map((m) => m.id),
    );
    if (failed.length > 0) {
      throw new Error(
        `Failed to delete Kodi collection: ${failed.length} item(s) could not be untagged`,
      );
    }
  }

  async cleanupCollectionForLibrary(
    collectionId: string,
    libraryId: string,
    isManualCollection: boolean,
  ): Promise<void> {
    const children = await this.getCollectionChildren(collectionId);
    const fromLibrary = children.filter((c) => c.library.id === libraryId);
    if (fromLibrary.length > 0) {
      await this.removeBatchFromCollection(
        collectionId,
        fromLibrary.map((c) => c.id),
      );
    }
    const remaining = await this.getCollectionChildren(collectionId);
    if (remaining.length === 0 && !isManualCollection) {
      await this.deleteCollection(collectionId);
    }
  }

  async getCollectionChildren(collectionId: string): Promise<MediaItem[]> {
    if (this.isShadowCollection(collectionId)) {
      const members = await this.memberRepo.find({
        where: { collectionId },
      });
      const items: MediaItem[] = [];
      for (const m of members) {
        const item = await this.getMetadata(m.itemId);
        if (item) items.push(item);
      }
      return items;
    }
    if (!this.client) return [];
    try {
      const { type, tag } = this.decodeTagCollectionId(collectionId);
      const filter = { field: 'tag', operator: 'is', value: tag };
      if (type === 'movie') {
        const res = await this.client.call<KodiMoviesResult>(
          'VideoLibrary.GetMovies',
          { properties: [...KODI_MOVIE_PROPERTIES], filter },
        );
        return (res.movies ?? []).map((m) => KodiMapper.toMovie(m));
      }
      const res = await this.client.call<KodiTVShowsResult>(
        'VideoLibrary.GetTVShows',
        { properties: [...KODI_TVSHOW_PROPERTIES], filter },
      );
      return (res.tvshows ?? []).map((s) => KodiMapper.toTVShow(s));
    } catch (error) {
      this.logger.debug(
        `Kodi getCollectionChildren(${collectionId}) failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
      );
      return [];
    }
  }

  async addToCollection(collectionId: string, itemId: string): Promise<void> {
    await this.addBatchToCollection(collectionId, [itemId]);
  }

  async addBatchToCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    if (itemIds.length === 0) return [];
    let failed: string[];
    if (this.isShadowCollection(collectionId)) {
      failed = await this.addShadowMembers(collectionId, itemIds);
    } else {
      if (!this.client) return itemIds;
      const { type, tag } = this.decodeTagCollectionId(collectionId);
      failed = await this.addTagMembers(type, tag, itemIds);
    }
    this.invalidateCollectionsCache();
    return failed;
  }

  async removeFromCollection(
    collectionId: string,
    itemId: string,
  ): Promise<void> {
    await this.removeBatchFromCollection(collectionId, [itemId]);
  }

  async removeBatchFromCollection(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    if (itemIds.length === 0) return [];
    if (this.isShadowCollection(collectionId)) {
      try {
        await this.memberRepo
          .createQueryBuilder()
          .delete()
          .where('collectionId = :collectionId', { collectionId })
          .andWhere('itemId IN (:...itemIds)', { itemIds })
          .execute();
        this.invalidateCollectionsCache();
        return [];
      } catch (error) {
        // Honor the contract: report failures via the return value, don't throw.
        this.logger.warn(
          `Kodi shadow remove failed: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
        );
        return itemIds;
      }
    }
    if (!this.client) return itemIds;
    const { type, tag } = this.decodeTagCollectionId(collectionId);
    const failed = await this.removeTagMembers(type, tag, itemIds);
    this.invalidateCollectionsCache();
    return failed;
  }

  async updateCollection(
    params: UpdateCollectionParams,
  ): Promise<MediaCollection> {
    if (this.isShadowCollection(params.collectionId)) {
      const c = await this.collectionRepo.findOne({
        where: { id: params.collectionId },
      });
      if (!c) throw new Error('Kodi collection not found');
      c.title = params.title ?? c.title;
      c.summary = params.summary ?? c.summary;
      await this.collectionRepo.save(c);
      const refreshed = await this.getCollection(params.collectionId);
      if (!refreshed) throw new Error('Kodi collection vanished after update');
      return refreshed;
    }
    // Tag-backed collections carry no separate title/summary metadata, and the
    // id encodes the (stable) tag, so title/summary changes are a no-op on the
    // Kodi side. Return the current collection so the caller's contract holds.
    const current = await this.getCollection(params.collectionId, true);
    if (!current) throw new Error('Kodi collection not found');
    return current;
  }

  async updateCollectionVisibility(
    settings: CollectionVisibilitySettings,
  ): Promise<void> {
    void settings;
    throw new Error(
      'updateCollectionVisibility is not supported on Kodi (Plex-only feature)',
    );
  }

  async reorderCollectionItems(
    collectionId: string,
    orderedItemIds: string[],
  ): Promise<void> {
    void collectionId;
    void orderedItemIds;
    throw new Error('Collection sort is not supported on Kodi');
  }

  async setCollectionImage(
    collectionId: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    void collectionId;
    void buffer;
    void contentType;
    throw new Error('Collection posters are not supported on Kodi');
  }

  // ============================================================================
  // Playlists
  // ============================================================================

  async getPlaylists(_libraryId: string): Promise<MediaPlaylist[]> {
    // Kodi playlists are file-based and have no library-scoped, collection-style
    // analogue; PLAYLISTS is unsupported, so report none.
    void _libraryId;
    return [];
  }

  // ============================================================================
  // Destructive
  // ============================================================================

  async deleteFromDisk(itemId: string): Promise<void> {
    // Kodi's JSON-RPC API cannot delete a file from disk — VideoLibrary.Remove*
    // only drops the library entry, which would falsely report success while the
    // file remains. Fail loud: Kodi deletion requires a configured Radarr/Sonarr.
    void itemId;
    throw new Error(
      'Kodi cannot delete files from disk over JSON-RPC. Configure Radarr/Sonarr to enable deletion for Kodi-managed media.',
    );
  }

  // ============================================================================
  // Context-action ID resolution
  // ============================================================================

  async getAllIdsForContextAction(
    collectionType: MediaItemType | undefined,
    context: { type: MediaItemType; id: string },
    mediaId: string,
  ): Promise<string[]> {
    if (!collectionType || collectionType === context.type) {
      return [mediaId];
    }
    if (collectionType === 'show' && context.type === 'episode') {
      const ep = await this.getMetadata(context.id);
      return ep?.grandparentId ? [ep.grandparentId] : [];
    }
    if (collectionType === 'episode' && context.type === 'show') {
      const episodes = await this.collectDescendantEpisodes(context.id);
      return episodes.map((e) => e.id);
    }
    return [mediaId];
  }

  // ============================================================================
  // Cache management
  // ============================================================================

  resetMetadataCache(_itemId?: string): void {
    // The Kodi cache only holds the server status aggregate, never per-item
    // entries, so per-item invalidation collapses to a full flush.
    void _itemId;
    this.cache.flush();
  }

  // ============================================================================
  // Connection testing (used by settings before save)
  // ============================================================================

  async testConnection(
    url: string,
    username: string,
    password: string,
  ): Promise<{
    success: boolean;
    serverName?: string;
    version?: string;
    error?: string;
  }> {
    const probe = new KodiApi({ url, username, password, timeout: 15000 });
    try {
      const pong = await probe.call<string>('JSONRPC.Ping');
      if (pong !== 'pong') {
        return { success: false, error: 'Unexpected response from Kodi' };
      }
      const props = await probe.call<KodiApplicationProperties>(
        'Application.GetProperties',
        { properties: ['version', 'name'] },
      );
      const v = props.version;
      return {
        success: true,
        serverName: props.name ?? 'Kodi',
        version: v ? `${v.major}.${v.minor}` : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: formatConnectionFailureMessage(error, 'Connection failed'),
      };
    }
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private defaultTypeForLibrary(libraryId: string): MediaItemType {
    return libraryId === KODI_LIBRARIES.MOVIES.id ? 'movie' : 'show';
  }

  private toKodiSort(
    sort?: string,
    order?: 'asc' | 'desc',
  ): { method: string; order: string } {
    const method =
      sort === 'addDate'
        ? 'dateadded'
        : sort === 'releaseDate'
          ? 'year'
          : sort === 'rating'
            ? 'rating'
            : sort === 'watchCount'
              ? 'playcount'
              : 'sorttitle';
    return { method, order: order === 'desc' ? 'descending' : 'ascending' };
  }

  /** Fetch and map a single item by composite id. Throws KodiRpcError on -32602. */
  private async fetchItem(itemId: string): Promise<MediaItem | undefined> {
    if (!this.client) return undefined;
    const { type, numericId } = KodiMapper.decodeItemId(itemId);
    if (type === 'movie') {
      const res = await this.client.call<KodiMovieDetailsResult>(
        'VideoLibrary.GetMovieDetails',
        { movieid: numericId, properties: [...KODI_MOVIE_PROPERTIES] },
      );
      return res.moviedetails
        ? KodiMapper.toMovie(res.moviedetails)
        : undefined;
    }
    if (type === 'show') {
      const res = await this.client.call<KodiTVShowDetailsResult>(
        'VideoLibrary.GetTVShowDetails',
        { tvshowid: numericId, properties: [...KODI_TVSHOW_PROPERTIES] },
      );
      return res.tvshowdetails
        ? KodiMapper.toTVShow(res.tvshowdetails)
        : undefined;
    }
    if (type === 'season') {
      const res = await this.client.call<KodiSeasonDetailsResult>(
        'VideoLibrary.GetSeasonDetails',
        { seasonid: numericId, properties: [...KODI_SEASON_PROPERTIES] },
      );
      return res.seasondetails
        ? KodiMapper.toSeason(res.seasondetails)
        : undefined;
    }
    const res = await this.client.call<KodiEpisodeDetailsResult>(
      'VideoLibrary.GetEpisodeDetails',
      { episodeid: numericId, properties: [...KODI_EPISODE_PROPERTIES] },
    );
    return res.episodedetails
      ? KodiMapper.toEpisode(res.episodedetails)
      : undefined;
  }

  private async fetchSeasonRaw(
    seasonid: number,
  ): Promise<KodiSeason | undefined> {
    if (!this.client) return undefined;
    const res = await this.client.call<KodiSeasonDetailsResult>(
      'VideoLibrary.GetSeasonDetails',
      { seasonid, properties: [...KODI_SEASON_PROPERTIES] },
    );
    return res.seasondetails;
  }

  private async fetchAllSeasons(): Promise<KodiSeason[]> {
    if (!this.client) return [];
    const shows = await this.client.call<KodiTVShowsResult>(
      'VideoLibrary.GetTVShows',
      { limits: { start: 0, end: 0 } },
    );
    const total = shows.limits.total;
    if (total === 0) return [];
    const all = await this.client.call<KodiTVShowsResult>(
      'VideoLibrary.GetTVShows',
      { properties: [] },
    );
    const seasons: KodiSeason[] = [];
    for (const show of all.tvshows ?? []) {
      const res = await this.client.call<KodiSeasonsResult>(
        'VideoLibrary.GetSeasons',
        { tvshowid: show.tvshowid, properties: [...KODI_SEASON_PROPERTIES] },
      );
      seasons.push(...(res.seasons ?? []));
    }
    return seasons;
  }

  /** Flatten every episode under a show or season composite id. */
  private async collectDescendantEpisodes(
    parentId: string,
  ): Promise<MediaItem[]> {
    const { type } = KodiMapper.decodeItemId(parentId);
    if (type === 'season') {
      return this.getChildrenMetadata(parentId, 'episode');
    }
    if (type === 'show') {
      return this.getChildrenMetadata(parentId, 'episode');
    }
    return [];
  }

  // ---- Tag-backed collection helpers -------------------------------------

  private encodeTagCollectionId(type: MediaItemType, tag: string): string {
    return `kc_tag:${type}:${Buffer.from(tag, 'utf8').toString('base64url')}`;
  }

  private decodeTagCollectionId(id: string): {
    type: MediaItemType;
    tag: string;
  } {
    const parts = id.split(':');
    if (parts[0] !== 'kc_tag' || parts.length !== 3) {
      throw new Error(`Invalid Kodi tag collection id: ${id}`);
    }
    return {
      type: parts[1] as MediaItemType,
      tag: Buffer.from(parts[2], 'base64url').toString('utf8'),
    };
  }

  private isShadowCollection(id: string): boolean {
    return id.startsWith('kc_shadow:');
  }

  /** Drop the cached getCollections() results so a mutation is visible at once. */
  private invalidateCollectionsCache(): void {
    const prefix = `${KODI_CACHE_KEYS.COLLECTIONS}:`;
    const stale = this.cache.data.keys().filter((k) => k.startsWith(prefix));
    if (stale.length > 0) this.cache.data.del(stale);
  }

  /** Strip the managed prefix and trailing `[token]` to recover a display title. */
  private tagToTitle(tag: string): string {
    let title = tag;
    if (title.startsWith(KODI_COLLECTION_TAG_PREFIX)) {
      title = title.slice(KODI_COLLECTION_TAG_PREFIX.length).trim();
    }
    const open = title.lastIndexOf(' [');
    if (open > 0 && title.endsWith(']')) {
      title = title.slice(0, open);
    }
    return title;
  }

  private async tagExists(type: MediaItemType, tag: string): Promise<boolean> {
    if (!this.client) return false;
    const kodiTagType = type === 'movie' ? 'movie' : 'tvshow';
    const res = await this.client.call<KodiTagsResult>('VideoLibrary.GetTags', {
      type: kodiTagType,
      properties: [],
    });
    return (res.tags ?? []).some((t) => t.label === tag);
  }

  private async countTagMembers(
    type: MediaItemType,
    tag: string,
  ): Promise<number> {
    if (!this.client) return 0;
    const filter = { field: 'tag', operator: 'is', value: tag };
    const limits = { start: 0, end: 0 };
    if (type === 'movie') {
      const res = await this.client.call<KodiMoviesResult>(
        'VideoLibrary.GetMovies',
        { filter, limits },
      );
      return res.limits.total;
    }
    const res = await this.client.call<KodiTVShowsResult>(
      'VideoLibrary.GetTVShows',
      { filter, limits },
    );
    return res.limits.total;
  }

  /** Read-modify-write the `tag` array of each item, adding the managed tag. */
  private async addTagMembers(
    type: MediaItemType,
    tag: string,
    itemIds: string[],
  ): Promise<string[]> {
    return this.mutateTagMembers(type, itemIds, (tags) =>
      tags.includes(tag) ? tags : [...tags, tag],
    );
  }

  private async removeTagMembers(
    type: MediaItemType,
    tag: string,
    itemIds: string[],
  ): Promise<string[]> {
    return this.mutateTagMembers(type, itemIds, (tags) =>
      tags.filter((t) => t !== tag),
    );
  }

  private async mutateTagMembers(
    type: MediaItemType,
    itemIds: string[],
    mutate: (tags: string[]) => string[],
  ): Promise<string[]> {
    if (!this.client) return itemIds;
    const failed: string[] = [];
    for (const itemId of itemIds) {
      try {
        const { type: itemType, numericId } = KodiMapper.decodeItemId(itemId);
        if (itemType !== type) {
          failed.push(itemId);
          continue;
        }
        const current = await this.readItemTags(type, numericId);
        const next = mutate(current);
        // Skip the write when membership is already in the desired state.
        if (
          next.length === current.length &&
          next.every((t, i) => t === current[i])
        ) {
          continue;
        }
        if (type === 'movie') {
          await this.client.call('VideoLibrary.SetMovieDetails', {
            movieid: numericId,
            tag: next,
          });
        } else {
          await this.client.call('VideoLibrary.SetTVShowDetails', {
            tvshowid: numericId,
            tag: next,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Kodi tag mutation failed for ${itemId}: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
        );
        failed.push(itemId);
      }
    }
    return failed;
  }

  private async readItemTags(
    type: MediaItemType,
    numericId: number,
  ): Promise<string[]> {
    if (!this.client) return [];
    if (type === 'movie') {
      const res = await this.client.call<KodiMovieDetailsResult>(
        'VideoLibrary.GetMovieDetails',
        { movieid: numericId, properties: ['tag'] },
      );
      return res.moviedetails?.tag ?? [];
    }
    const res = await this.client.call<KodiTVShowDetailsResult>(
      'VideoLibrary.GetTVShowDetails',
      { tvshowid: numericId, properties: ['tag'] },
    );
    return res.tvshowdetails?.tag ?? [];
  }

  // ---- Shadow collection helpers -----------------------------------------

  private async addShadowMembers(
    collectionId: string,
    itemIds: string[],
  ): Promise<string[]> {
    const failed: string[] = [];
    for (const itemId of itemIds) {
      try {
        const existing = await this.memberRepo.findOne({
          where: { collectionId, itemId },
        });
        if (!existing) {
          await this.memberRepo.save(
            this.memberRepo.create({ collectionId, itemId }),
          );
        }
      } catch (error) {
        this.logger.warn(
          `Kodi shadow add failed for ${itemId}: ${formatConnectionFailureMessage(error, 'Connection failed')}`,
        );
        failed.push(itemId);
      }
    }
    return failed;
  }
}
