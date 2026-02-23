import {
  MaintainerrEvent,
  MediaItem,
  MetadataProviderPreference,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';
import { TvdbApiService } from '../api/tvdb-api/tvdb.service';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsService } from '../settings/settings.service';
import { MetadataDetails, ResolvedMediaIds } from './interfaces/metadata.types';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

@Injectable()
export class MetadataService {
  private preference: MetadataProviderPreference =
    MetadataProviderPreference.TMDB_PRIMARY;

  constructor(
    private readonly tmdbApi: TmdbApiService,
    private readonly tvdbApi: TvdbApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly settings: SettingsService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(MetadataService.name);
  }

  onModuleInit() {
    this.preference =
      this.settings.metadata_provider_preference ??
      MetadataProviderPreference.TMDB_PRIMARY;
  }

  @OnEvent(MaintainerrEvent.Settings_Updated)
  handleSettingsUpdate(payload: {
    settings: { metadata_provider_preference?: MetadataProviderPreference };
  }) {
    if (payload.settings.metadata_provider_preference) {
      this.preference = payload.settings.metadata_provider_preference;
    }
  }

  // ───── Availability helpers ─────

  /** TMDB always available (has a default key). */
  private get tmdbAvailable(): boolean {
    return true;
  }

  /** TVDB only available when the user has supplied a key and auth succeeded. */
  private get tvdbAvailable(): boolean {
    return this.tvdbApi.isAvailable();
  }

  /** Whether TVDB is the preferred (first-try) provider. */
  private get preferTvdb(): boolean {
    return (
      this.preference === MetadataProviderPreference.TVDB_PRIMARY &&
      this.tvdbAvailable
    );
  }

  // ───── ID Resolution ─────

  /**
   * Resolve a media-server ID to external metadata IDs.
   * Walks up the hierarchy (episode→season→show) for child items.
   */
  async resolveIds(
    mediaServerId: string,
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      let mediaItem = await mediaServer.getMetadata(mediaServerId);

      if (!mediaItem) {
        this.logger.warn(
          `Failed to fetch metadata for media server item: ${mediaServerId}`,
        );
        return undefined;
      }

      // Walk up to the show level for seasons/episodes
      mediaItem = mediaItem.grandparentId
        ? await mediaServer.getMetadata(mediaItem.grandparentId)
        : mediaItem.parentId
          ? await mediaServer.getMetadata(mediaItem.parentId)
          : mediaItem;

      return this.resolveIdsFromMediaItem(mediaItem);
    } catch (e) {
      this.logger.warn(
        `Failed to resolve IDs for ${mediaServerId}: ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Resolve external IDs from a MediaItem (provider IDs already available).
   * Tries to resolve both tmdbId and tvdbId using the preferred provider first.
   */
  async resolveIdsFromMediaItem(
    item: MediaItem,
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const type: 'movie' | 'tv' = ['show', 'season', 'episode'].includes(
        item.type,
      )
        ? 'tv'
        : 'movie';

      const ids: ResolvedMediaIds = { type };

      // Extract direct provider IDs from media server metadata
      if (item.providerIds?.tmdb?.length) {
        ids.tmdbId = +item.providerIds.tmdb[0] || undefined;
      }
      if (item.providerIds?.tvdb?.length) {
        ids.tvdbId = +item.providerIds.tvdb[0] || undefined;
      }
      if (item.providerIds?.imdb?.length) {
        ids.imdbId = item.providerIds.imdb[0] || undefined;
      }

      // Already have both — nothing to resolve
      if (ids.tmdbId && ids.tvdbId) return ids;

      // Fill missing ID using the preferred provider first
      if (this.preferTvdb) {
        await this.fillTvdbFromTmdb(ids);
        await this.fillTmdbFromTvdb(ids, item);
      } else {
        await this.fillTmdbFromTvdb(ids, item);
        await this.fillTvdbFromTmdb(ids);
      }

      return ids;
    } catch (e) {
      this.logger.warn(`Failed to resolve IDs from media item: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Resolve a TVDB ID for a media item. Uses direct provider IDs when
   * available, then TVDB search, and falls back to TMDB external_ids.
   * Used internally and by resolveAllSeriesIds.
   */
  private async resolveTvdbId(
    mediaServerId: string,
    tmdbId?: number | null,
  ): Promise<number | undefined> {
    // 1. Check media server metadata for direct TVDB ID
    const mediaServer = await this.mediaServerFactory.getService();
    let mediaData = await mediaServer.getMetadata(mediaServerId);

    // Walk up hierarchy for seasons/episodes
    mediaData = mediaData?.grandparentId
      ? await mediaServer.getMetadata(mediaData.grandparentId)
      : mediaData?.parentId
        ? await mediaServer.getMetadata(mediaData.parentId)
        : mediaData;

    if (mediaData?.providerIds?.tvdb?.length) {
      const directId = Number(mediaData.providerIds.tvdb[0]);
      if (directId) return directId;
    }

    // 2. If TVDB service is available and we have an IMDB ID, search TVDB directly
    if (this.tvdbAvailable && mediaData?.providerIds?.imdb?.length) {
      const imdbId = mediaData.providerIds.imdb[0];
      const results = await this.tvdbApi.searchByRemoteId(imdbId);
      if (results?.length) {
        const match = results[0];
        const tvdbId = match.series?.id ?? match.movie?.id;
        if (tvdbId) return tvdbId;
      }
    }

    // 3. Fallback: resolve via TMDB → external_ids.tvdb_id
    if (!tmdbId && mediaData) {
      const tmdbResult = await this.resolveTmdbIdFromMediaItem(mediaData);
      tmdbId = tmdbResult?.id;
    }

    if (tmdbId) {
      const tmdbShow = await this.tmdbApi.getTvShow({ tvId: tmdbId });
      if (tmdbShow?.external_ids?.tvdb_id) {
        return tmdbShow.external_ids.tvdb_id;
      }
    }

    return undefined;
  }

  /**
   * Resolve all series-matching IDs for a media item (can return multiple when
   * upstream providers list multiple entries). Used by SonarrGetterService for
   * Sonarr series lookup.
   */
  async resolveAllSeriesIds(item: MediaItem): Promise<number[]> {
    const tvdbIds: number[] = [];

    // Direct provider IDs
    if (item.providerIds?.tvdb) {
      for (const tvdbId of item.providerIds.tvdb) {
        const numId = Number(tvdbId);
        if (numId && !tvdbIds.includes(numId)) {
          tvdbIds.push(numId);
        }
      }
    }

    // Try fetching fresh metadata from media server
    if (tvdbIds.length === 0) {
      const mediaServer = await this.mediaServerFactory.getService();
      const metadata = await mediaServer.getMetadata(item.id);
      if (metadata?.providerIds?.tvdb) {
        for (const tvdbId of metadata.providerIds.tvdb) {
          const numId = Number(tvdbId);
          if (numId && !tvdbIds.includes(numId)) {
            tvdbIds.push(numId);
          }
        }
      }
    }

    // If TVDB is available, search by IMDB ID
    if (tvdbIds.length === 0 && this.tvdbAvailable) {
      const imdbId = item.providerIds?.imdb?.[0];
      if (imdbId) {
        const results = await this.tvdbApi.searchByRemoteId(imdbId);
        if (results?.length) {
          for (const r of results) {
            const id = r.series?.id ?? r.movie?.id;
            if (id && !tvdbIds.includes(id)) tvdbIds.push(id);
          }
        }
      }
    }

    // Last resort: TMDB → external_ids.tvdb_id
    if (tvdbIds.length === 0) {
      const tmdbResp = await this.resolveTmdbIdFromMediaItem(item);
      if (tmdbResp?.id) {
        const tmdbShow = await this.tmdbApi.getTvShow({ tvId: tmdbResp.id });
        if (tmdbShow?.external_ids?.tvdb_id) {
          tvdbIds.push(tmdbShow.external_ids.tvdb_id);
        }
      }
    }

    return tvdbIds;
  }

  /**
   * Resolve all movie-matching TMDB IDs for a media item (can return multiple
   * when upstream providers list multiple entries). Used by RadarrGetterService
   * for Radarr movie lookup.
   */
  async resolveAllMovieIds(item: MediaItem): Promise<number[]> {
    const tmdbIds: number[] = [];

    // Direct provider IDs
    if (item.providerIds?.tmdb) {
      for (const tmdbId of item.providerIds.tmdb) {
        const numId = Number(tmdbId);
        if (numId && !tmdbIds.includes(numId)) {
          tmdbIds.push(numId);
        }
      }
    }

    // Try fetching fresh metadata from media server
    if (tmdbIds.length === 0) {
      const mediaServer = await this.mediaServerFactory.getService();
      const metadata = await mediaServer.getMetadata(item.id);
      if (metadata?.providerIds?.tmdb) {
        for (const tmdbId of metadata.providerIds.tmdb) {
          const numId = Number(tmdbId);
          if (numId && !tmdbIds.includes(numId)) {
            tmdbIds.push(numId);
          }
        }
      }
    }

    // Cross-reference via IMDB → TMDB find
    if (tmdbIds.length === 0) {
      const imdbId = item.providerIds?.imdb?.[0];
      if (imdbId) {
        const resp = await this.tmdbApi.getByExternalId({
          externalId: imdbId,
          type: 'imdb',
        });
        if (resp?.movie_results?.length) {
          for (const m of resp.movie_results) {
            if (m.id && !tmdbIds.includes(m.id)) tmdbIds.push(m.id);
          }
        }
      }
    }

    // Cross-reference via TVDB → TMDB find
    if (tmdbIds.length === 0 && item.providerIds?.tvdb?.length) {
      for (const tvdbId of item.providerIds.tvdb) {
        const numTvdbId = Number(tvdbId);
        if (!numTvdbId) continue;
        const resp = await this.tmdbApi.getByExternalId({
          externalId: numTvdbId,
          type: 'tvdb',
        });
        if (resp?.movie_results?.length) {
          for (const m of resp.movie_results) {
            if (m.id && !tmdbIds.includes(m.id)) tmdbIds.push(m.id);
          }
        }
        if (tmdbIds.length > 0) break;
      }
    }

    // Last resort: GUID-based resolver
    if (tmdbIds.length === 0) {
      const tmdbResp = await this.resolveTmdbIdFromMediaItem(item);
      if (tmdbResp?.id) {
        tmdbIds.push(tmdbResp.id);
      }
    }

    return tmdbIds;
  }

  // ───── Media Details ─────

  /**
   * Get normalised movie details, using the preferred provider with fallback.
   */
  async getMovieDetails(ids: {
    tmdbId?: number;
    tvdbId?: number;
  }): Promise<MetadataDetails | undefined> {
    if (this.preferTvdb && ids.tvdbId) {
      const tvdb = await this.getMovieDetailsFromTvdb(ids.tvdbId);
      if (tvdb) return tvdb;
    }

    if (ids.tmdbId) {
      const tmdb = await this.getMovieDetailsFromTmdb(ids.tmdbId);
      if (tmdb) return tmdb;
    }

    // Fallback to the other provider
    if (!this.preferTvdb && ids.tvdbId && this.tvdbAvailable) {
      return this.getMovieDetailsFromTvdb(ids.tvdbId);
    }

    return undefined;
  }

  /**
   * Get normalised TV show details, using the preferred provider with fallback.
   */
  async getTvShowDetails(ids: {
    tmdbId?: number;
    tvdbId?: number;
  }): Promise<MetadataDetails | undefined> {
    if (this.preferTvdb && ids.tvdbId) {
      const tvdb = await this.getTvShowDetailsFromTvdb(ids.tvdbId);
      if (tvdb) return tvdb;
    }

    if (ids.tmdbId) {
      const tmdb = await this.getTvShowDetailsFromTmdb(ids.tmdbId);
      if (tmdb) return tmdb;
    }

    // Fallback to the other provider
    if (!this.preferTvdb && ids.tvdbId && this.tvdbAvailable) {
      return this.getTvShowDetailsFromTvdb(ids.tvdbId);
    }

    return undefined;
  }

  /**
   * Get details for either movie or TV based on resolved IDs.
   */
  async getDetails(
    ids: ResolvedMediaIds,
  ): Promise<MetadataDetails | undefined> {
    return ids.type === 'movie'
      ? this.getMovieDetails(ids)
      : this.getTvShowDetails(ids);
  }

  // ───── Image URLs ─────

  /**
   * Get a full poster image URL.
   * @param size TMDB image size (e.g. 'w500', 'w300_and_h450_face')
   */
  async getPosterUrl(
    ids: { tmdbId?: number; tvdbId?: number },
    type: 'movie' | 'tv',
    size = 'w500',
  ): Promise<string | undefined> {
    if (this.preferTvdb && ids.tvdbId) {
      const url = await this.getPosterFromTvdb(ids.tvdbId, type);
      if (url) return url;
    }

    if (ids.tmdbId) {
      const url = await this.getPosterFromTmdb(ids.tmdbId, type, size);
      if (url) return url;
    }

    // Fallback
    if (!this.preferTvdb && ids.tvdbId && this.tvdbAvailable) {
      return this.getPosterFromTvdb(ids.tvdbId, type);
    }

    return undefined;
  }

  /**
   * Get a full backdrop/fanart image URL.
   */
  async getBackdropUrl(
    ids: { tmdbId?: number; tvdbId?: number },
    type: 'movie' | 'tv',
    size = 'w1280',
  ): Promise<string | undefined> {
    if (this.preferTvdb && ids.tvdbId) {
      const url = await this.getBackdropFromTvdb(ids.tvdbId, type);
      if (url) return url;
    }

    if (ids.tmdbId) {
      const url = await this.getBackdropFromTmdb(ids.tmdbId, type, size);
      if (url) return url;
    }

    // Fallback
    if (!this.preferTvdb && ids.tvdbId && this.tvdbAvailable) {
      return this.getBackdropFromTvdb(ids.tvdbId, type);
    }

    return undefined;
  }

  // ───── TMDB helpers ─────

  private async getMovieDetailsFromTmdb(
    tmdbId: number,
  ): Promise<MetadataDetails | undefined> {
    const movie = await this.tmdbApi.getMovie({ movieId: tmdbId });
    if (!movie) return undefined;

    return {
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterUrl: movie.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}`
        : undefined,
      backdropUrl: movie.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w1280${movie.backdrop_path}`
        : undefined,
      externalIds: {
        tmdbId: movie.id,
        tvdbId: movie.external_ids?.tvdb_id ?? undefined,
        imdbId: movie.external_ids?.imdb_id ?? movie.imdb_id ?? undefined,
        type: 'movie',
      },
      type: 'movie',
    };
  }

  private async getTvShowDetailsFromTmdb(
    tmdbId: number,
  ): Promise<MetadataDetails | undefined> {
    const show = await this.tmdbApi.getTvShow({ tvId: tmdbId });
    if (!show) return undefined;

    return {
      id: show.id,
      title: show.name,
      overview: show.overview,
      posterUrl: show.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${show.poster_path}`
        : undefined,
      backdropUrl: show.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w1280${show.backdrop_path}`
        : undefined,
      externalIds: {
        tmdbId: show.id,
        tvdbId: show.external_ids?.tvdb_id ?? undefined,
        imdbId: show.external_ids?.imdb_id ?? undefined,
        type: 'tv',
      },
      type: 'tv',
    };
  }

  private async getPosterFromTmdb(
    tmdbId: number,
    type: 'movie' | 'tv',
    size: string,
  ): Promise<string | undefined> {
    const path =
      type === 'movie'
        ? (await this.tmdbApi.getMovie({ movieId: tmdbId }))?.poster_path
        : (await this.tmdbApi.getTvShow({ tvId: tmdbId }))?.poster_path;
    return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : undefined;
  }

  private async getBackdropFromTmdb(
    tmdbId: number,
    type: 'movie' | 'tv',
    size: string,
  ): Promise<string | undefined> {
    const path =
      type === 'movie'
        ? (await this.tmdbApi.getMovie({ movieId: tmdbId }))?.backdrop_path
        : (await this.tmdbApi.getTvShow({ tvId: tmdbId }))?.backdrop_path;
    return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : undefined;
  }

  // ───── TVDB helpers ─────

  private async getMovieDetailsFromTvdb(
    tvdbId: number,
  ): Promise<MetadataDetails | undefined> {
    const movie = await this.tvdbApi.getMovie(tvdbId);
    if (!movie) return undefined;

    return {
      id: movie.id,
      title: movie.name,
      overview: movie.overview ?? undefined,
      posterUrl: this.tvdbApi.getPosterUrl(movie),
      backdropUrl: this.tvdbApi.getBackdropUrl(movie),
      externalIds: {
        tvdbId: movie.id,
        imdbId: this.tvdbApi.getImdbId(movie),
        type: 'movie',
      },
      type: 'movie',
    };
  }

  private async getTvShowDetailsFromTvdb(
    tvdbId: number,
  ): Promise<MetadataDetails | undefined> {
    const series = await this.tvdbApi.getSeries(tvdbId);
    if (!series) return undefined;

    return {
      id: series.id,
      title: series.name,
      overview: series.overview ?? undefined,
      posterUrl: this.tvdbApi.getPosterUrl(series),
      backdropUrl: this.tvdbApi.getBackdropUrl(series),
      externalIds: {
        tvdbId: series.id,
        imdbId: this.tvdbApi.getImdbId(series),
        type: 'tv',
      },
      type: 'tv',
    };
  }

  private async getPosterFromTvdb(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<string | undefined> {
    const record =
      type === 'movie'
        ? await this.tvdbApi.getMovie(tvdbId)
        : await this.tvdbApi.getSeries(tvdbId);
    return this.tvdbApi.getPosterUrl(record);
  }

  private async getBackdropFromTvdb(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<string | undefined> {
    const record =
      type === 'movie'
        ? await this.tvdbApi.getMovie(tvdbId)
        : await this.tvdbApi.getSeries(tvdbId);
    return this.tvdbApi.getBackdropUrl(record);
  }

  // ───── ID Resolution helpers ─────

  /**
   * If we have a TMDB ID but no TVDB ID, look up TMDB's external_ids
   * to fill the gap.
   */
  private async fillTvdbFromTmdb(ids: ResolvedMediaIds): Promise<void> {
    if (ids.tvdbId || !ids.tmdbId) return;

    try {
      const externalIds =
        ids.type === 'movie'
          ? (await this.tmdbApi.getMovie({ movieId: ids.tmdbId }))?.external_ids
          : (await this.tmdbApi.getTvShow({ tvId: ids.tmdbId }))?.external_ids;

      if (externalIds?.tvdb_id) {
        ids.tvdbId = externalIds.tvdb_id;
      }
    } catch (e) {
      this.logger.debug(`Failed to resolve TVDB ID from TMDB: ${e.message}`);
    }
  }

  /**
   * If we have a TVDB ID but no TMDB ID, search TMDB by external ID.
   * Falls back to the provider-ID-based resolver.
   */
  private async fillTmdbFromTvdb(
    ids: ResolvedMediaIds,
    item: MediaItem,
  ): Promise<void> {
    if (ids.tmdbId) return;

    try {
      // Try TVDB → TMDB cross-reference
      if (ids.tvdbId) {
        const resp = await this.tmdbApi.getByExternalId({
          externalId: ids.tvdbId,
          type: 'tvdb',
        });
        const id =
          ids.type === 'movie'
            ? resp?.movie_results?.[0]?.id
            : resp?.tv_results?.[0]?.id;
        if (id) {
          ids.tmdbId = id;
          return;
        }
      }

      // Last resort: full provider-ID resolver
      const tmdbResult = await this.resolveTmdbIdFromMediaItem(item);
      if (tmdbResult?.id) {
        ids.tmdbId = tmdbResult.id;
      }
    } catch (e) {
      this.logger.debug(`Failed to resolve TMDB ID: ${e.message}`);
    }
  }

  // ───── TMDB ID Resolution ─────

  /**
   * Resolve a TMDB ID from a MediaItem's provider IDs.
   * Checks tmdb → tvdb → imdb, using TMDB's external-ID lookup as fallback.
   */
  private async resolveTmdbIdFromMediaItem(
    item: MediaItem,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined } | undefined> {
    try {
      let id: number | undefined = undefined;

      if (item.providerIds) {
        for (const tmdbId of item.providerIds.tmdb || []) {
          id = +tmdbId;
          if (id) break;
        }

        if (!id) {
          for (const tvdbId of item.providerIds.tvdb || []) {
            const resp = await this.tmdbApi.getByExternalId({
              externalId: +tvdbId,
              type: 'tvdb',
            });
            if (resp) {
              id =
                resp.movie_results?.length > 0
                  ? resp.movie_results[0]?.id
                  : resp.tv_results?.[0]?.id;
              if (id) break;
            }
          }
        }

        if (!id) {
          for (const imdbId of item.providerIds.imdb || []) {
            const resp = await this.tmdbApi.getByExternalId({
              externalId: imdbId,
              type: 'imdb',
            });
            if (resp) {
              id =
                resp.movie_results?.length > 0
                  ? resp.movie_results[0]?.id
                  : resp.tv_results?.[0]?.id;
              if (id) break;
            }
          }
        }
      }

      return {
        type: ['show', 'season', 'episode'].includes(item.type)
          ? 'tv'
          : 'movie',
        id,
      };
    } catch (e) {
      this.logger.warn(
        `Failed to resolve TMDB ID from provider IDs: ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }
}
