import {
  MaintainerrEvent,
  MediaItem,
  MetadataProviderPreference,
} from '@maintainerr/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsService } from '../settings/settings.service';
import {
  IMetadataProvider,
  MetadataProviders,
} from './interfaces/metadata-provider.interface';
import {
  MetadataDetails,
  PersonDetails,
  ResolvedMediaIds,
} from './interfaces/metadata.types';

@Injectable()
export class MetadataService {
  private preference: MetadataProviderPreference =
    MetadataProviderPreference.TMDB_PRIMARY;

  constructor(
    @Inject(MetadataProviders)
    private readonly providers: IMetadataProvider[],
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
   * The preferred provider comes first; remaining providers keep their
   * registration order. Unavailable providers are omitted.
   */
  private getOrderedProviders(): IMetadataProvider[] {
    // Preference values follow the pattern "tmdb_primary" / "tvdb_primary".
    // Extract the prefix and match against provider names (case-insensitive).
    const primaryName = this.preference.replace('_primary', '').toUpperCase();
    const preferred = this.providers.find((p) => p.name === primaryName);

    return [
      ...(preferred ? [preferred] : []),
      ...this.providers.filter((p) => p !== preferred),
    ].filter((p) => p.isAvailable());
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

      // Fill in any missing IDs — provider-agnostic
      await this.resolveAllIds(ids);

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

    if (tvdbIds.length === 0) {
      const resolved = await this.resolveIdFromProviderIds(item);
      if (resolved?.tvdbId) tvdbIds.push(resolved.tvdbId);
    }

    return tvdbIds;
  }

  /**
   * Resolve all movie-matching TMDB IDs for a media item (can return multiple
   * when upstream providers list multiple entries). Used by RadarrGetterService.
   */
  async resolveAllMovieIds(item: MediaItem): Promise<number[]> {
    const tmdbIds = await this.collectDirectIds(item, 'tmdb');

    if (tmdbIds.length === 0) {
      const resolved = await this.resolveIdFromProviderIds(item);
      if (resolved?.tmdbId) tmdbIds.push(resolved.tmdbId);
    }

    return tmdbIds;
  }

  // ───── Media Details ─────

  /**
   * Get normalised details for a movie or TV show,
   * using the preferred provider with fallback.
   */
  async getDetails(
    ids: { tmdbId?: number; tvdbId?: number },
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getDetails(id, type),
    );
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

  // ───── Provider-agnostic ID Resolution ─────

  /**
   * Fill in any missing IDs using available providers in preference order.
   * Uses details lookup (which returns externalIds) as the primary strategy,
   * then falls back to external ID search (e.g. IMDB → provider lookup).
   */
  private async resolveAllIds(ids: ResolvedMediaIds): Promise<void> {
    if (ids.tmdbId && ids.tvdbId) return;

    // Strategy 1: get details from any provider that has a matching ID,
    // then extract cross-provider IDs from the response
    if (ids.tmdbId || ids.tvdbId) {
      const details = await this.getDetails(ids, ids.type);

      if (details?.externalIds) {
        ids.tmdbId ??= details.externalIds.tmdbId;
        ids.tvdbId ??= details.externalIds.tvdbId;
        ids.imdbId ??= details.externalIds.imdbId;
      }
      if (ids.tmdbId && ids.tvdbId) return;
    }

    // Strategy 2: search by IMDB ID across providers
    if (ids.imdbId) {
      await this.fillIdsFromExternalSearch(ids, ids.imdbId, 'imdb');
    }
  }

  /**
   * Search providers by an external ID and tag each result to the provider
   * that produced it (via assignId), so IDs never get mixed up.
   */
  private async fillIdsFromExternalSearch(
    ids: ResolvedMediaIds,
    externalId: string | number,
    idType: 'imdb' | 'tvdb',
  ): Promise<void> {
    for (const provider of this.getOrderedProviders()) {
      const results = await provider.findByExternalId(externalId, idType);
      if (!results?.length) continue;

      for (const r of results) {
        const id = ids.type === 'movie' ? r.movieId : r.tvShowId;
        if (id !== undefined) {
          provider.assignId(ids, id);
        }
      }
      if (ids.tmdbId && ids.tvdbId) return;
    }
  }

  /**
   * Resolve IDs from a MediaItem's provider IDs by extracting what's available
   * directly, then filling gaps via resolveAllIds.
   */
  private async resolveIdFromProviderIds(
    item: MediaItem,
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const type = this.mediaTypeFromItem(item);
      const ids: ResolvedMediaIds = { type };

      if (item.providerIds?.tmdb?.length) {
        ids.tmdbId = +item.providerIds.tmdb[0] || undefined;
      }
      if (item.providerIds?.tvdb?.length) {
        ids.tvdbId = +item.providerIds.tvdb[0] || undefined;
      }
      if (item.providerIds?.imdb?.length) {
        ids.imdbId = item.providerIds.imdb[0] || undefined;
      }

      await this.resolveAllIds(ids);

      return ids;
    } catch (e) {
      this.logger.warn(`Failed to resolve ID from provider IDs: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }
}
