import {
  MaintainerrEvent,
  MediaItem,
  MetadataProviderPreference,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsService } from '../settings/settings.service';
import { IMetadataProvider } from './interfaces/metadata-provider.interface';
import { MetadataDetails, ResolvedMediaIds } from './interfaces/metadata.types';
import { TmdbMetadataProvider } from './providers/tmdb-metadata.provider';
import { TvdbMetadataProvider } from './providers/tvdb-metadata.provider';

@Injectable()
export class MetadataService {
  private preference: MetadataProviderPreference =
    MetadataProviderPreference.TMDB_PRIMARY;

  constructor(
    private readonly tmdbProvider: TmdbMetadataProvider,
    private readonly tvdbProvider: TvdbMetadataProvider,
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

  // ───── Provider ordering & fallback ─────

  /**
   * Build an ordered list of available providers based on user preference.
   * The preferred provider comes first; unavailable providers are omitted.
   */
  private getOrderedProviders(): IMetadataProvider[] {
    if (this.preference === MetadataProviderPreference.TVDB_PRIMARY) {
      return this.tvdbProvider.isAvailable()
        ? [this.tvdbProvider, this.tmdbProvider]
        : [this.tmdbProvider];
    }
    return this.tvdbProvider.isAvailable()
      ? [this.tmdbProvider, this.tvdbProvider]
      : [this.tmdbProvider];
  }

  /**
   * Try each provider in preference order until one returns a result.
   * Each provider is only attempted if it has a matching ID.
   */
  private async withProviderFallback<T>(
    ids: { tmdbId?: number; tvdbId?: number },
    fn: (provider: IMetadataProvider, id: number) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    for (const provider of this.getOrderedProviders()) {
      const id = provider.extractId(ids);
      if (id !== undefined) {
        const result = await fn(provider, id);
        if (result !== undefined) return result;
      }
    }
    return undefined;
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
      const type = this.mediaTypeFromItem(item);
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

      // Fill missing IDs — try preferred provider direction first
      if (this.preference === MetadataProviderPreference.TVDB_PRIMARY) {
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
   * Resolve all series-matching IDs for a media item (can return multiple when
   * upstream providers list multiple entries). Used by SonarrGetterService for
   * Sonarr series lookup.
   */
  async resolveAllSeriesIds(item: MediaItem): Promise<number[]> {
    const tvdbIds = await this.collectDirectIds(item, 'tvdb');

    // If TVDB provider is available, search by IMDB ID
    if (tvdbIds.length === 0 && this.tvdbProvider.isAvailable()) {
      const imdbId = item.providerIds?.imdb?.[0];
      if (imdbId) {
        const results = await this.tvdbProvider.searchByRemoteId(imdbId);
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
        const details = await this.tmdbProvider.getTvShowDetails(tmdbResp.id);
        if (details?.externalIds?.tvdbId) {
          tvdbIds.push(details.externalIds.tvdbId);
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
    const tmdbIds = await this.collectDirectIds(item, 'tmdb');

    // Cross-reference via IMDB → TMDB find
    if (tmdbIds.length === 0) {
      const imdbId = item.providerIds?.imdb?.[0];
      if (imdbId) {
        const resp = await this.tmdbProvider.findByExternalId({
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
        const resp = await this.tmdbProvider.findByExternalId({
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
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getMovieDetails(id),
    );
  }

  /**
   * Get normalised TV show details, using the preferred provider with fallback.
   */
  async getTvShowDetails(ids: {
    tmdbId?: number;
    tvdbId?: number;
  }): Promise<MetadataDetails | undefined> {
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getTvShowDetails(id),
    );
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
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getPosterUrl(id, type, size),
    );
  }

  /**
   * Get a full backdrop/fanart image URL.
   */
  async getBackdropUrl(
    ids: { tmdbId?: number; tvdbId?: number },
    type: 'movie' | 'tv',
    size = 'w1280',
  ): Promise<string | undefined> {
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getBackdropUrl(id, type, size),
    );
  }

  // ───── Private helpers ─────

  /** Determine normalised media type from a MediaItem. */
  private mediaTypeFromItem(item: MediaItem): 'movie' | 'tv' {
    return ['show', 'season', 'episode'].includes(item.type) ? 'tv' : 'movie';
  }

  /**
   * Collect direct provider IDs from a MediaItem, falling back to fresh
   * metadata from the media server. Returns unique numeric IDs.
   */
  private async collectDirectIds(
    item: MediaItem,
    providerKey: 'tmdb' | 'tvdb',
  ): Promise<number[]> {
    const ids: number[] = [];

    if (item.providerIds?.[providerKey]) {
      for (const rawId of item.providerIds[providerKey]) {
        const numId = Number(rawId);
        if (numId && !ids.includes(numId)) ids.push(numId);
      }
    }

    if (ids.length === 0) {
      const mediaServer = await this.mediaServerFactory.getService();
      const metadata = await mediaServer.getMetadata(item.id);
      if (metadata?.providerIds?.[providerKey]) {
        for (const rawId of metadata.providerIds[providerKey]) {
          const numId = Number(rawId);
          if (numId && !ids.includes(numId)) ids.push(numId);
        }
      }
    }

    return ids;
  }

  /**
   * If we have a TMDB ID but no TVDB ID, look up TMDB's external_ids
   * to fill the gap.
   */
  private async fillTvdbFromTmdb(ids: ResolvedMediaIds): Promise<void> {
    if (ids.tvdbId || !ids.tmdbId) return;

    try {
      const details =
        ids.type === 'movie'
          ? await this.tmdbProvider.getMovieDetails(ids.tmdbId)
          : await this.tmdbProvider.getTvShowDetails(ids.tmdbId);

      if (details?.externalIds?.tvdbId) {
        ids.tvdbId = details.externalIds.tvdbId;
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
        const resp = await this.tmdbProvider.findByExternalId({
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
            const resp = await this.tmdbProvider.findByExternalId({
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
            const resp = await this.tmdbProvider.findByExternalId({
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
        type: this.mediaTypeFromItem(item),
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
