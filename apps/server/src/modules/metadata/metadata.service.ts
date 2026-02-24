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
  ProviderIds,
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

  onApplicationBootstrap() {
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
    ids: ProviderIds,
    fn: (provider: IMetadataProvider, id: number) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    return (await this.withProviderFallbackDetailed(ids, fn))?.result;
  }

  private async withProviderFallbackDetailed<T>(
    ids: ProviderIds,
    fn: (provider: IMetadataProvider, id: number) => Promise<T | undefined>,
  ): Promise<{ result: T; provider: string; id: number } | undefined> {
    for (const provider of this.getOrderedProviders()) {
      const id = provider.extractId(ids);
      if (id === undefined) continue;

      const result = await fn(provider, id);
      if (result !== undefined) return { result, provider: provider.name, id };
    }
    return undefined;
  }

  // ───── ID Resolution ─────

  /**
   * Resolve a media-server ID to external metadata IDs.
   * Walks up the hierarchy (episode->season->show) for child items.
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
   * Extracts what's directly available, then fills gaps via provider fallback.
   */
  async resolveIdsFromMediaItem(
    item: MediaItem,
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const ids = this.extractDirectIds(item);
      await this.resolveAllIds(ids);
      return ids;
    } catch (e) {
      this.logger.warn(`Failed to resolve IDs from media item: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Resolve all IDs for a specific provider from a media item.
   * Can return multiple when upstream providers list multiple entries.
   */
  async resolveAllIdsForProvider(
    item: MediaItem,
    providerKey: string,
  ): Promise<number[]> {
    const ids = await this.collectDirectIds(item, providerKey);
    if (ids.length > 0) return ids;

    const resolved = await this.resolveIdsFromMediaItem(item);
    const provider = this.providers.find((p) => p.idKey === providerKey);
    if (!resolved || !provider) return ids;

    const resolvedId = provider.extractId(resolved);
    if (resolvedId !== undefined) ids.push(resolvedId);

    return ids;
  }

  /** Used by SonarrGetterService. */
  async resolveAllSeriesIds(item: MediaItem): Promise<number[]> {
    return this.resolveAllIdsForProvider(item, 'tvdb');
  }

  /** Used by RadarrGetterService. */
  async resolveAllMovieIds(item: MediaItem): Promise<number[]> {
    return this.resolveAllIdsForProvider(item, 'tmdb');
  }

  // ───── Media Details ─────

  /**
   * Get normalised details for a movie or TV show,
   * using the preferred provider with fallback.
   *
   * When the successful result includes externalIds that differ from the
   * IDs we called with, correct them in-place. This fixes bad IDs from
   * the media server (e.g. wrong TVDB ID) using cross-references from
   * whichever provider actually returned data.
   */
  async getDetails(
    ids: ProviderIds,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    const providerResult = await this.withProviderFallbackDetailed(
      ids,
      (provider, id) => provider.getDetails(id, type),
    );
    if (!providerResult) return undefined;

    const ext = providerResult.result.externalIds;
    if (!ext) return providerResult.result;

    // Cross-fix any wrong IDs using the authoritative response
    for (const provider of this.providers) {
      const currentId = provider.extractId(ids);
      const correctId = provider.extractId(ext);
      if (
        currentId === undefined ||
        correctId === undefined ||
        currentId === correctId
      )
        continue;

      this.logger.warn(
        `Corrected ${provider.name} ID: ${currentId} → ${correctId} ` +
          `(via ${providerResult.provider} cross-reference). ` +
          `The media server may have incorrect metadata for this item.`,
      );
      provider.assignId(ids, correctId);
    }

    return providerResult.result;
  }

  // ───── Person Details ─────

  /**
   * Get normalised person details, using the preferred provider with fallback.
   * Person IDs are provider-specific (e.g. a TMDB person ID).
   */
  async getPersonDetails(ids: ProviderIds): Promise<PersonDetails | undefined> {
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getPersonDetails(id),
    );
  }

  // ───── Image URLs ─────

  /**
   * Get a full poster image URL and which provider served it.
   * @param size Provider-specific size hint (e.g. 'w500' for TMDB; ignored by TVDB)
   */
  async getPosterUrl(
    ids: ProviderIds,
    type: 'movie' | 'tv',
    size = 'w500',
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    return this.resolveImageUrl(ids, type, (provider, id) =>
      provider.getPosterUrl(id, type, size),
    );
  }

  /** Get a full backdrop/fanart image URL and which provider served it. */
  async getBackdropUrl(
    ids: ProviderIds,
    type: 'movie' | 'tv',
    size = 'w1280',
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    return this.resolveImageUrl(ids, type, (provider, id) =>
      provider.getBackdropUrl(id, type, size),
    );
  }

  // ───── Private helpers ─────

  /** True when every registered provider already has an ID in the bag. */
  private allIdsPresent(ids: ProviderIds): boolean {
    return this.providers.every((p) => p.extractId(ids) !== undefined);
  }

  /** Copy any values present in `source` but missing in `ids`. */
  private fillMissingIds(ids: ProviderIds, source: ProviderIds): void {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || ids[key] !== undefined) continue;
      ids[key] = value;
    }
  }

  /** Resolve IDs then run a provider image lookup, returning { url, provider, id }. */
  private async resolveImageUrl(
    ids: ProviderIds,
    type: 'movie' | 'tv',
    fn: (
      provider: IMetadataProvider,
      id: number,
    ) => Promise<string | undefined>,
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    await this.resolveImageIds(ids, type);
    const result = await this.withProviderFallbackDetailed(ids, fn);
    if (!result) return undefined;
    return { url: result.result, provider: result.provider, id: result.id };
  }

  /**
   * Ensure all provider IDs are resolved before image lookup.
   * Calls getDetails which cross-fixes wrong IDs and provides
   * externalIds to fill gaps. Relies on the underlying API cache
   * (6h TMDB / 1h TVDB) for performance on repeat requests.
   */
  private async resolveImageIds(
    ids: ProviderIds,
    type: 'movie' | 'tv',
  ): Promise<void> {
    const details = await this.getDetails(ids, type);
    if (details?.externalIds) this.fillMissingIds(ids, details.externalIds);

    if (this.allIdsPresent(ids)) return;

    // Strategy 2: search by non-provider external IDs (e.g. IMDB → TVDB for movies)
    const bag: ResolvedMediaIds = { ...ids, type };
    const providerKeys = new Set(this.providers.map((p) => p.idKey));
    for (const [key, value] of Object.entries(bag)) {
      if (!value || key === 'type' || providerKeys.has(key)) continue;
      await this.fillIdsFromExternalSearch(bag, value, key);
      if (this.allIdsPresent(bag)) break;
    }
    this.fillMissingIds(ids, bag);
  }

  /** Determine normalised media type from a MediaItem. */
  private mediaTypeFromItem(item: MediaItem): 'movie' | 'tv' {
    return ['show', 'season', 'episode'].includes(item.type) ? 'tv' : 'movie';
  }

  /** Extract provider IDs directly available on a MediaItem. */
  private extractDirectIds(item: MediaItem): ResolvedMediaIds {
    const ids: ResolvedMediaIds = { type: this.mediaTypeFromItem(item) };
    if (!item.providerIds) return ids;

    const providerKeys = new Set(this.providers.map((p) => p.idKey));

    for (const [key, values] of Object.entries(item.providerIds)) {
      if (!values?.length) continue;

      // Registered providers get numeric IDs via assignId
      if (providerKeys.has(key)) {
        const num = +values[0];
        const provider = this.providers.find((p) => p.idKey === key);
        if (num && provider) provider.assignId(ids, num);
        continue;
      }

      // Non-provider IDs (e.g. imdb) stored as-is
      if (values[0]) ids[key] = values[0];
    }

    return ids;
  }

  /**
   * Collect direct provider IDs from a MediaItem, falling back to fresh
   * metadata from the media server. Returns unique numeric IDs.
   */
  private async collectDirectIds(
    item: MediaItem,
    providerKey: string,
  ): Promise<number[]> {
    const ids: number[] = [];

    const pushUniqueIds = (rawIds: string[]) => {
      for (const rawId of rawIds) {
        const numId = Number(rawId);
        if (numId && !ids.includes(numId)) ids.push(numId);
      }
    };

    const directIds = item.providerIds?.[providerKey];
    if (directIds) pushUniqueIds(directIds);

    if (ids.length > 0) return ids;

    const mediaServer = await this.mediaServerFactory.getService();
    const metadata = await mediaServer.getMetadata(item.id);
    const freshIds = metadata?.providerIds?.[providerKey];
    if (freshIds) pushUniqueIds(freshIds);

    return ids;
  }

  // ───── Provider-agnostic ID Resolution ─────

  /**
   * Fill in any missing IDs using available providers in preference order.
   * Uses details lookup (which returns externalIds) as the primary strategy,
   * then falls back to external ID search (e.g. IMDB -> provider lookup).
   */
  private async resolveAllIds(ids: ResolvedMediaIds): Promise<void> {
    if (this.allIdsPresent(ids)) return;

    // Strategy 1: cross-provider IDs from a details lookup
    if (this.providers.some((p) => p.extractId(ids) !== undefined)) {
      const details = await this.getDetails(ids, ids.type);
      if (details?.externalIds) this.fillMissingIds(ids, details.externalIds);
      if (this.allIdsPresent(ids)) return;
    }

    // Strategy 2: search by any non-provider external IDs across providers
    const providerKeys = new Set(this.providers.map((p) => p.idKey));
    for (const [key, value] of Object.entries(ids)) {
      if (!value || key === 'type' || providerKeys.has(key)) continue;
      await this.fillIdsFromExternalSearch(ids, value, key);
      if (this.allIdsPresent(ids)) return;
    }
  }

  /**
   * Search providers by an external ID and tag each result to the provider
   * that produced it (via assignId), so IDs never get mixed up.
   */
  private async fillIdsFromExternalSearch(
    ids: ResolvedMediaIds,
    externalId: string | number,
    idType: string,
  ): Promise<void> {
    for (const provider of this.getOrderedProviders()) {
      const results = await provider.findByExternalId(externalId, idType);
      if (!results?.length) continue;

      for (const r of results) {
        const id = ids.type === 'movie' ? r.movieId : r.tvShowId;
        if (id !== undefined) provider.assignId(ids, id);
      }
      if (this.allIdsPresent(ids)) return;
    }
  }
}
