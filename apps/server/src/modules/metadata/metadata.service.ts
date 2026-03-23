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

  private getOrderedProviders(): IMetadataProvider[] {
    const primaryName = this.preference.replace('_primary', '').toUpperCase();
    const preferred = this.providers.find((p) => p.name === primaryName);

    return [
      ...(preferred ? [preferred] : []),
      ...this.providers.filter((p) => p !== preferred),
    ].filter((p) => p.isAvailable());
  }

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

  private normalizeRequiredProviderKeys(
    requiredProviderKeys?: string | string[],
  ): string[] {
    if (!requiredProviderKeys) return [];
    return Array.isArray(requiredProviderKeys)
      ? requiredProviderKeys
      : [requiredProviderKeys];
  }

  // ───── ID Resolution ─────

  async resolveIds(
    mediaServerId: string,
    requiredProviderKeys?: string | string[],
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

      mediaItem = mediaItem.grandparentId
        ? await mediaServer.getMetadata(mediaItem.grandparentId)
        : mediaItem.parentId
          ? await mediaServer.getMetadata(mediaItem.parentId)
          : mediaItem;

      return this.resolveIdsFromMediaItem(mediaItem, requiredProviderKeys);
    } catch (e) {
      this.logger.warn(
        `Failed to resolve IDs for ${mediaServerId}: ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Resolve external IDs from a MediaItem.
   *
   * @param targetProviderKey Skip resolution entirely when this provider's
   *   ID is already present (e.g. 'tmdb' for Radarr, 'tvdb' for Sonarr).
   */
  async resolveIdsFromMediaItem(
    item: MediaItem,
    requiredProviderKeys?: string | string[],
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const requiredKeys =
        this.normalizeRequiredProviderKeys(requiredProviderKeys);
      const ids = this.extractDirectIds(item);
      const allAvailableProviderKeys = this.getOrderedProviders().map(
        (provider) => provider.idKey,
      );

      if (
        requiredKeys.length === 0 &&
        this.hasRequiredIds(ids, allAvailableProviderKeys)
      ) {
        return ids;
      }

      if (requiredKeys.length > 0 && this.hasRequiredIds(ids, requiredKeys)) {
        return ids;
      }

      await this.resolveAllIds(ids, requiredKeys);

      return this.hasRequiredIds(ids, requiredKeys) ? ids : undefined;
    } catch (e) {
      this.logger.warn(`Failed to resolve IDs from media item: ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  async resolveAllIdsForProvider(
    item: MediaItem,
    providerKey: string,
  ): Promise<number[]> {
    const ids = await this.collectDirectIds(item, providerKey);
    if (ids.length > 0) return ids;

    const resolved = await this.resolveIdsFromMediaItem(item, providerKey);
    const provider = this.providers.find((p) => p.idKey === providerKey);
    if (!resolved || !provider) return ids;

    const resolvedId = provider.extractId(resolved);
    if (resolvedId !== undefined) ids.push(resolvedId);

    return ids;
  }

  async resolveAllSeriesIds(item: MediaItem): Promise<number[]> {
    return this.resolveAllIdsForProvider(item, 'tvdb');
  }

  async resolveAllMovieIds(item: MediaItem): Promise<number[]> {
    return this.resolveAllIdsForProvider(item, 'tmdb');
  }

  // ───── Media Details ─────

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

  async getPersonDetails(ids: ProviderIds): Promise<PersonDetails | undefined> {
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getPersonDetails(id),
    );
  }

  // ───── Image URLs ─────

  async getPosterUrl(
    ids: ProviderIds,
    type: 'movie' | 'tv',
    size = 'w500',
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    return this.resolveImageUrl(ids, type, (provider, id) =>
      provider.getPosterUrl(id, type, size),
    );
  }

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

  /** Check if the required ID(s) are present. */
  private hasRequiredIds(
    ids: ProviderIds,
    requiredProviderKeys: string[] = [],
  ): boolean {
    if (requiredProviderKeys.length > 0) {
      return requiredProviderKeys.every((providerKey) => {
        const provider = this.providers.find((p) => p.idKey === providerKey);
        return provider ? provider.extractId(ids) !== undefined : true;
      });
    }

    return this.providers.some(
      (provider) => provider.extractId(ids) !== undefined,
    );
  }

  private fillMissingIds(ids: ProviderIds, source: ProviderIds): void {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || ids[key] !== undefined) continue;
      ids[key] = value;
    }
  }

  /**
   * Resolve + image lookup. Always runs resolveAllIds (no short-circuit)
   * because images need all provider IDs and cross-fixing of wrong IDs.
   */
  private async resolveImageUrl(
    ids: ProviderIds,
    type: 'movie' | 'tv',
    fn: (
      provider: IMetadataProvider,
      id: number,
    ) => Promise<string | undefined>,
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    const bag: ResolvedMediaIds = { ...ids, type };
    await this.resolveAllIds(bag);

    // Copy resolved/corrected IDs back to caller's object
    for (const [key, value] of Object.entries(bag)) {
      if (value !== undefined && key !== 'type') ids[key] = value;
    }

    const result = await this.withProviderFallbackDetailed(ids, fn);
    if (!result) return undefined;
    return { url: result.result, provider: result.provider, id: result.id };
  }

  private mediaTypeFromItem(item: MediaItem): 'movie' | 'tv' {
    return ['show', 'season', 'episode'].includes(item.type) ? 'tv' : 'movie';
  }

  private extractDirectIds(item: MediaItem): ResolvedMediaIds {
    const ids: ResolvedMediaIds = { type: this.mediaTypeFromItem(item) };
    if (!item.providerIds) return ids;

    const providerKeys = new Set(this.providers.map((p) => p.idKey));

    for (const [key, values] of Object.entries(item.providerIds)) {
      if (!values?.length) continue;

      if (providerKeys.has(key)) {
        const num = +values[0];
        const provider = this.providers.find((p) => p.idKey === key);
        if (num && provider) provider.assignId(ids, num);
        continue;
      }

      if (values[0]) ids[key] = values[0];
    }

    return ids;
  }

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

  // ───── Single resolution engine ─────

  /**
   * Fill missing IDs. Two strategies:
   * 1. getDetails — cross-fixes wrong IDs + provides externalIds
   * 2. External ID search — e.g. IMDB → TVDB for movies
   */
  private async resolveAllIds(
    ids: ResolvedMediaIds,
    requiredProviderKeys: string[] = [],
  ): Promise<void> {
    if (this.providers.some((p) => p.extractId(ids) !== undefined)) {
      const details = await this.getDetails(ids, ids.type);
      if (details?.externalIds) this.fillMissingIds(ids, details.externalIds);
      if (
        requiredProviderKeys.length > 0 &&
        this.hasRequiredIds(ids, requiredProviderKeys)
      ) {
        return;
      }
    }

    const providerKeys = new Set(this.providers.map((p) => p.idKey));
    for (const [key, value] of Object.entries(ids)) {
      if (!value || key === 'type' || providerKeys.has(key)) continue;

      for (const provider of this.getOrderedProviders()) {
        if (provider.extractId(ids) !== undefined) continue;

        const results = await provider.findByExternalId(value, key);
        if (!results?.length) continue;

        for (const r of results) {
          const id = ids.type === 'movie' ? r.movieId : r.tvShowId;
          if (id !== undefined) provider.assignId(ids, id);
        }
      }
      if (
        requiredProviderKeys.length > 0 &&
        this.hasRequiredIds(ids, requiredProviderKeys)
      ) {
        return;
      }
    }
  }
}
