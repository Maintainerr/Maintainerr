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
import {
  MetadataDetails,
  PersonDetails,
  ResolvedMediaIds,
} from './interfaces/metadata.types';
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
   * Resolve all series-matching TVDB IDs for a media item (can return multiple
   * when upstream providers list multiple entries). Used by SonarrGetterService.
   */
  async resolveAllSeriesIds(item: MediaItem): Promise<number[]> {
    const tvdbIds = await this.collectDirectIds(item, 'tvdb');

    // Cross-reference via IMDB → provider search
    if (tvdbIds.length === 0) {
      const imdbId = item.providerIds?.imdb?.[0];
      if (imdbId) {
        const found = await this.searchExternalIds([imdbId], 'imdb', 'tv');
        for (const id of found) {
          if (!tvdbIds.includes(id)) tvdbIds.push(id);
        }
      }
    }

    // Last resort: get details from any provider and extract tvdbId
    if (tvdbIds.length === 0) {
      const resolvedId = await this.resolveIdFromProviderIds(item);
      if (resolvedId?.id) {
        const details = await this.withProviderFallback(
          { tmdbId: resolvedId.id },
          (provider, id) => provider.getTvShowDetails(id),
        );
        if (details?.externalIds?.tvdbId) {
          tvdbIds.push(details.externalIds.tvdbId);
        }
      }
    }

    return tvdbIds;
  }

  /**
   * Resolve all movie-matching TMDB IDs for a media item (can return multiple
   * when upstream providers list multiple entries). Used by RadarrGetterService.
   */
  async resolveAllMovieIds(item: MediaItem): Promise<number[]> {
    const tmdbIds = await this.collectDirectIds(item, 'tmdb');

    // Cross-reference via IMDB → provider search
    if (tmdbIds.length === 0) {
      const imdbId = item.providerIds?.imdb?.[0];
      if (imdbId) {
        const found = await this.searchExternalIds([imdbId], 'imdb', 'movie');
        for (const id of found) {
          if (!tmdbIds.includes(id)) tmdbIds.push(id);
        }
      }
    }

    // Cross-reference via TVDB → provider search
    if (tmdbIds.length === 0 && item.providerIds?.tvdb?.length) {
      const found = await this.searchExternalIds(
        item.providerIds.tvdb,
        'tvdb',
        'movie',
      );
      for (const id of found) {
        if (!tmdbIds.includes(id)) tmdbIds.push(id);
      }
    }

    // Last resort: full provider-ID resolver
    if (tmdbIds.length === 0) {
      const resolvedId = await this.resolveIdFromProviderIds(item);
      if (resolvedId?.id) {
        tmdbIds.push(resolvedId.id);
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

  // ───── Person Details ─────

  /**
   * Get normalised person details, using the preferred provider with fallback.
   * Person IDs are provider-specific (e.g. a TMDB person ID).
   */
  async getPersonDetails(ids: {
    tmdbId?: number;
    tvdbId?: number;
  }): Promise<PersonDetails | undefined> {
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getPersonDetails(id),
    );
  }

  // ───── Image URLs ─────

  /**
   * Get a full poster image URL.
   * @param size Provider-specific size hint (e.g. 'w500' for TMDB; ignored by TVDB)
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

    const pushUniqueIds = (rawIds: string[]) => {
      for (const rawId of rawIds) {
        const numId = Number(rawId);
        if (numId && !ids.includes(numId)) ids.push(numId);
      }
    };

    if (item.providerIds?.[providerKey]) {
      pushUniqueIds(item.providerIds[providerKey]);
    }

    if (ids.length === 0) {
      const mediaServer = await this.mediaServerFactory.getService();
      const metadata = await mediaServer.getMetadata(item.id);
      if (metadata?.providerIds?.[providerKey]) {
        pushUniqueIds(metadata.providerIds[providerKey]);
      }
    }

    return ids;
  }

  /**
   * Search for IDs across all providers using external ID lookup.
   * Returns unique IDs matching the requested result type.
   */
  private async searchExternalIds(
    rawIds: string[],
    idType: 'imdb' | 'tvdb',
    resultType: 'movie' | 'tv',
  ): Promise<number[]> {
    const results: number[] = [];

    for (const rawId of rawIds) {
      const externalId = idType === 'imdb' ? rawId : Number(rawId);
      if (!externalId) continue;

      for (const provider of this.getOrderedProviders()) {
        const searchResults = await provider.findByExternalId(
          externalId,
          idType,
        );
        if (!searchResults) continue;

        for (const r of searchResults) {
          const id = resultType === 'movie' ? r.movieId : r.tvShowId;
          if (id && !results.includes(id)) results.push(id);
        }

        if (results.length > 0) break;
      }

      if (results.length > 0) break;
    }

    return results;
  }

  /**
   * If we have a TMDB ID but no TVDB ID, look up the details
   * to fill the gap via externalIds.
   */
  private async fillTvdbFromTmdb(ids: ResolvedMediaIds): Promise<void> {
    if (ids.tvdbId || !ids.tmdbId) return;

    try {
      const details =
        ids.type === 'movie'
          ? await this.getMovieDetails({ tmdbId: ids.tmdbId })
          : await this.getTvShowDetails({ tmdbId: ids.tmdbId });

      if (details?.externalIds?.tvdbId) {
        ids.tvdbId = details.externalIds.tvdbId;
      }
    } catch (e) {
      this.logger.debug(`Failed to resolve TVDB ID from TMDB: ${e.message}`);
    }
  }

  /**
   * If we have a TVDB ID but no TMDB ID, search providers by external ID.
   * Falls back to the provider-ID-based resolver.
   */
  private async fillTmdbFromTvdb(
    ids: ResolvedMediaIds,
    item: MediaItem,
  ): Promise<void> {
    if (ids.tmdbId) return;

    try {
      // Try TVDB → cross-reference via providers
      if (ids.tvdbId) {
        const found = await this.searchExternalIds(
          [String(ids.tvdbId)],
          'tvdb',
          ids.type,
        );
        if (found.length > 0) {
          ids.tmdbId = found[0];
          return;
        }
      }

      // Last resort: full provider-ID resolver
      const resolvedId = await this.resolveIdFromProviderIds(item);
      if (resolvedId?.id) {
        ids.tmdbId = resolvedId.id;
      }
    } catch (e) {
      this.logger.debug(`Failed to resolve TMDB ID: ${e.message}`);
    }
  }

  // ───── Provider-agnostic ID Resolution ─────

  /**
   * Resolve an ID from a MediaItem's provider IDs by searching across all
   * available providers. Checks tmdb direct IDs first, then tvdb, then imdb.
   */
  private async resolveIdFromProviderIds(
    item: MediaItem,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined } | undefined> {
    try {
      const type = this.mediaTypeFromItem(item);
      let id: number | undefined;

      // Direct TMDB IDs — no external search needed
      if (item.providerIds?.tmdb) {
        for (const tmdbId of item.providerIds.tmdb) {
          id = +tmdbId;
          if (id) break;
        }
      }

      // Search providers by TVDB ID
      if (!id) {
        const found = await this.searchExternalIds(
          item.providerIds?.tvdb || [],
          'tvdb',
          type,
        );
        if (found.length > 0) id = found[0];
      }

      // Search providers by IMDB ID
      if (!id) {
        const found = await this.searchExternalIds(
          item.providerIds?.imdb || [],
          'imdb',
          type,
        );
        if (found.length > 0) id = found[0];
      }

      return { type, id };
    } catch (e) {
      this.logger.warn(`Failed to resolve ID from provider IDs: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }
}
