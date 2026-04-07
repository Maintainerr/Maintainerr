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
import { ServarrLookupCandidate } from './servarr-lookup.util';

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

  private static readonly preferenceToProviderName: Record<
    MetadataProviderPreference,
    string
  > = {
    [MetadataProviderPreference.TMDB_PRIMARY]: 'TMDB',
    [MetadataProviderPreference.TVDB_PRIMARY]: 'TVDB',
  };

  private getOrderedProviders(): IMetadataProvider[] {
    const primaryName =
      MetadataService.preferenceToProviderName[this.preference];
    const preferred = this.providers.find(
      (provider) => provider.name === primaryName,
    );

    return [
      ...(preferred ? [preferred] : []),
      ...this.providers.filter((provider) => provider !== preferred),
    ].filter((provider) => provider.isAvailable());
  }

  public getOrderedProviderKeys(): string[] {
    return this.getOrderedProviders().map((provider) => provider.idKey);
  }

  public buildServarrLookupCandidates(
    ids: Partial<Record<string, number | undefined>>,
  ): ServarrLookupCandidate[] {
    const candidateKeys = [
      ...this.getOrderedProviderKeys(),
      ...Object.keys(ids),
    ];
    const seen = new Set<string>();
    const lookupCandidates: ServarrLookupCandidate[] = [];

    for (const providerKey of candidateKeys) {
      if (seen.has(providerKey)) {
        continue;
      }

      seen.add(providerKey);

      const id = ids[providerKey];
      if (typeof id !== 'number' || !Number.isFinite(id)) {
        continue;
      }

      lookupCandidates.push({
        providerKey,
        id,
      });
    }

    return lookupCandidates;
  }

  private async withProviderFallback<T>(
    ids: ProviderIds,
    callback: (
      provider: IMetadataProvider,
      id: number,
    ) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    return (await this.withProviderFallbackDetailed(ids, callback))?.result;
  }

  private async withProviderFallbackDetailed<T>(
    ids: ProviderIds,
    callback: (
      provider: IMetadataProvider,
      id: number,
    ) => Promise<T | undefined>,
  ): Promise<{ result: T; provider: string; id: number } | undefined> {
    for (const provider of this.getOrderedProviders()) {
      const id = provider.extractId(ids);
      if (id === undefined) {
        continue;
      }

      const result = await callback(provider, id);
      if (result !== undefined) {
        return { result, provider: provider.name, id };
      }
    }

    return undefined;
  }

  private normalizeRequiredProviderKeys(
    requiredProviderKeys?: string | string[],
  ): string[] {
    if (!requiredProviderKeys) {
      return [];
    }

    return Array.isArray(requiredProviderKeys)
      ? requiredProviderKeys
      : [requiredProviderKeys];
  }

  private async getHierarchyResolutionItem(
    item: MediaItem,
    sourceMediaServerId?: string,
  ): Promise<MediaItem | undefined> {
    const hierarchyTargetId = item.grandparentId ?? item.parentId;

    if (!hierarchyTargetId) {
      return item;
    }

    const mediaServer = await this.mediaServerFactory.getService();
    const hierarchyItem = await mediaServer.getMetadata(hierarchyTargetId);

    if (!hierarchyItem) {
      const itemLabel = sourceMediaServerId ?? item.id;
      this.logger.warn(
        `Failed to fetch hierarchy metadata for media server item ${itemLabel} via parent item ${hierarchyTargetId}`,
      );
      return undefined;
    }

    return hierarchyItem;
  }

  async resolveIds(
    mediaServerId: string,
    requiredProviderKeys?: string | string[],
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      const mediaItem = await mediaServer.getMetadata(mediaServerId);

      if (!mediaItem) {
        this.logger.warn(
          `Failed to fetch metadata for media server item: ${mediaServerId}`,
        );
        return undefined;
      }

      return this.resolveIdsFromHierarchyMediaItem(
        mediaItem,
        requiredProviderKeys,
        mediaServerId,
      );
    } catch (error) {
      this.logger.warn(`Failed to resolve IDs for ${mediaServerId}`);
      this.logger.debug(error);
      return undefined;
    }
  }

  async resolveIdsFromHierarchyMediaItem(
    item: MediaItem,
    requiredProviderKeys?: string | string[],
    sourceMediaServerId?: string,
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const resolutionItem = await this.getHierarchyResolutionItem(
        item,
        sourceMediaServerId,
      );

      if (!resolutionItem) {
        return undefined;
      }

      return this.resolveIdsFromMediaItem(resolutionItem, requiredProviderKeys);
    } catch (error) {
      this.logger.warn('Failed to resolve IDs from hierarchy media item');
      this.logger.debug(error);
      return undefined;
    }
  }

  async resolveIdsFromMediaItem(
    item: MediaItem,
    requiredProviderKeys?: string | string[],
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const requiredKeys =
        this.normalizeRequiredProviderKeys(requiredProviderKeys);
      const ids = this.extractDirectIds(item);
      const hasAvailableDirectIds = this.getOrderedProviders().some(
        (provider) => provider.extractId(ids) !== undefined,
      );
      let metadataDetails: MetadataDetails | undefined;

      if (hasAvailableDirectIds) {
        metadataDetails = await this.getDetails(ids, ids.type);

        if (
          item.title &&
          metadataDetails?.title &&
          !(await this.matchesProviderDetails(item, metadataDetails))
        ) {
          this.logger.warn(
            `Rejected direct provider IDs for media server item "${item.title}" because they resolved to "${metadataDetails.title}" instead. The media server likely has incorrect metadata for this item, so no external IDs will be returned from this resolution attempt.`,
          );
          return undefined;
        }

        if (metadataDetails?.externalIds) {
          this.fillMissingIds(ids, metadataDetails.externalIds);
        }
      }

      if (requiredKeys.length === 0 && hasAvailableDirectIds) {
        return ids;
      }

      if (requiredKeys.length > 0 && this.hasRequiredIds(ids, requiredKeys)) {
        return ids;
      }

      await this.resolveAllIds(ids, requiredKeys, metadataDetails);

      return this.hasRequiredIds(ids, requiredKeys) ? ids : undefined;
    } catch (error) {
      this.logger.warn('Failed to resolve IDs from media item');
      this.logger.debug(error);
      return undefined;
    }
  }

  async getDetails(
    ids: ProviderIds,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    const providerResult = await this.withProviderFallbackDetailed(
      ids,
      (provider, id) => provider.getDetails(id, type),
    );

    if (!providerResult) {
      return undefined;
    }

    const externalIds = providerResult.result.externalIds;
    if (!externalIds) {
      return providerResult.result;
    }

    for (const provider of this.providers) {
      const currentId = provider.extractId(ids);
      const correctId = provider.extractId(externalIds);

      if (
        currentId === undefined ||
        correctId === undefined ||
        currentId === correctId
      ) {
        continue;
      }

      this.logger.warn(
        `Corrected ${provider.name} ID: ${currentId} to ${correctId} via ${providerResult.provider} cross-reference. The media server may have incorrect metadata for this item.`,
      );
      provider.assignId(ids, correctId);
    }

    return providerResult.result;
  }

  async getPersonDetails(ids: ProviderIds): Promise<PersonDetails | undefined> {
    return this.withProviderFallback(ids, (provider, id) =>
      provider.getPersonDetails(id),
    );
  }

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

  private hasRequiredIds(
    ids: ProviderIds,
    requiredProviderKeys: string[] = [],
  ): boolean {
    if (requiredProviderKeys.length > 0) {
      return requiredProviderKeys.every((providerKey) => {
        const provider = this.providers.find(
          (item) => item.idKey === providerKey,
        );
        return provider ? provider.extractId(ids) !== undefined : true;
      });
    }

    return this.getOrderedProviders().some(
      (provider) => provider.extractId(ids) !== undefined,
    );
  }

  private fillMissingIds(ids: ProviderIds, source: ProviderIds): void {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || ids[key] !== undefined) {
        continue;
      }

      ids[key] = value;
    }
  }

  private async resolveImageUrl(
    ids: ProviderIds,
    type: 'movie' | 'tv',
    callback: (
      provider: IMetadataProvider,
      id: number,
    ) => Promise<string | undefined>,
  ): Promise<{ url: string; provider: string; id: number } | undefined> {
    const bag: ResolvedMediaIds = { ...ids, type };
    await this.resolveAllIds(bag, this.getOrderedProviderKeys());

    for (const [key, value] of Object.entries(bag)) {
      if (value !== undefined && key !== 'type') {
        ids[key] = value;
      }
    }

    const result = await this.withProviderFallbackDetailed(ids, callback);
    if (!result) {
      return undefined;
    }

    return { url: result.result, provider: result.provider, id: result.id };
  }

  private mediaTypeFromItem(item: MediaItem): 'movie' | 'tv' {
    return ['show', 'season', 'episode'].includes(item.type) ? 'tv' : 'movie';
  }

  private extractDirectIds(item: MediaItem): ResolvedMediaIds {
    const ids: ResolvedMediaIds = { type: this.mediaTypeFromItem(item) };
    if (!item.providerIds) {
      return ids;
    }

    const providerKeys = new Set(
      this.providers.map((provider) => provider.idKey),
    );

    for (const [key, values] of Object.entries(item.providerIds)) {
      if (!values?.length) {
        continue;
      }

      if (providerKeys.has(key)) {
        const numericId = Number(values[0]);
        const provider = this.providers.find(
          (itemProvider) => itemProvider.idKey === key,
        );
        if (Number.isFinite(numericId) && provider) {
          provider.assignId(ids, numericId);
        }
        continue;
      }

      if (values[0]) {
        ids[key] = values[0];
      }
    }

    return ids;
  }

  private titlesMatch(left: string, right: string): boolean {
    const normalizedLeft = this.normalizeTitle(left);
    const normalizedRight = this.normalizeTitle(right);

    if (normalizedLeft.length === 0 || normalizedRight.length === 0) {
      return left.trim().toLowerCase() === right.trim().toLowerCase();
    }

    return normalizedLeft === normalizedRight;
  }

  private normalizeTitle(value: string): string {
    let normalized = '';

    for (const character of value.toLowerCase()) {
      const isDigit = character >= '0' && character <= '9';
      const isLetter = character >= 'a' && character <= 'z';
      if (isDigit || isLetter) {
        normalized += character;
      }
    }

    return normalized;
  }

  private readTitleYear(title: string): number | undefined {
    const trimmedTitle = title.trim();
    const parenthesizedSuffixStart = trimmedTitle.length - 6;
    const parenthesizedYear = trimmedTitle.slice(
      parenthesizedSuffixStart + 1,
      trimmedTitle.length - 1,
    );

    if (
      parenthesizedSuffixStart >= 0 &&
      trimmedTitle.endsWith(')') &&
      trimmedTitle.charAt(parenthesizedSuffixStart) === '(' &&
      this.isYear(parenthesizedYear)
    ) {
      return Number.parseInt(parenthesizedYear, 10);
    }

    const spaceSeparatedSuffixStart = trimmedTitle.length - 5;
    const spacedYear = trimmedTitle.slice(spaceSeparatedSuffixStart + 1);
    if (
      spaceSeparatedSuffixStart >= 0 &&
      trimmedTitle.charAt(spaceSeparatedSuffixStart) === ' ' &&
      this.isYear(spacedYear)
    ) {
      return Number.parseInt(spacedYear, 10);
    }

    return undefined;
  }

  private isYear(value: string): boolean {
    return (
      value.length === 4 &&
      value.charCodeAt(0) >= 48 &&
      value.charCodeAt(0) <= 57 &&
      value.charCodeAt(1) >= 48 &&
      value.charCodeAt(1) <= 57 &&
      value.charCodeAt(2) >= 48 &&
      value.charCodeAt(2) <= 57 &&
      value.charCodeAt(3) >= 48 &&
      value.charCodeAt(3) <= 57
    );
  }

  private readItemYear(
    item: Pick<MediaItem, 'year' | 'originallyAvailableAt' | 'title'>,
  ): number | undefined {
    if (item.year !== undefined) {
      return item.year;
    }

    if (item.originallyAvailableAt) {
      return item.originallyAvailableAt.getUTCFullYear();
    }

    return this.readTitleYear(item.title);
  }

  private stripTitleYear(title: string, year: number): string {
    const trimmedTitle = title.trim();
    const parenthesizedSuffix = `(${year})`;

    if (trimmedTitle.endsWith(parenthesizedSuffix)) {
      return trimmedTitle
        .slice(0, trimmedTitle.length - parenthesizedSuffix.length)
        .trimEnd();
    }

    const spaceSeparatedSuffix = ` ${year}`;
    if (trimmedTitle.endsWith(spaceSeparatedSuffix)) {
      return trimmedTitle
        .slice(0, trimmedTitle.length - spaceSeparatedSuffix.length)
        .trimEnd();
    }

    return trimmedTitle;
  }

  private matchesTitleWithYear(
    item: Pick<MediaItem, 'title' | 'year' | 'originallyAvailableAt'>,
    metadataDetails: MetadataDetails,
  ): boolean {
    const itemYear = this.readItemYear(item);
    if (
      itemYear === undefined ||
      metadataDetails.year === undefined ||
      itemYear !== metadataDetails.year
    ) {
      return false;
    }

    const metadataTitle = this.stripTitleYear(
      metadataDetails.title,
      metadataDetails.year,
    );

    return this.titlesMatch(
      this.stripTitleYear(item.title, itemYear),
      metadataTitle,
    );
  }

  private async loadItemDetails(
    itemId: string,
  ): Promise<MediaItem | undefined> {
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      return await mediaServer.getMetadata(itemId);
    } catch (error) {
      this.logger.debug(error);
      return undefined;
    }
  }

  private logYearMatch(itemTitle: string, providerTitle: string): void {
    this.logger.debug(
      `Title mismatch resolved by year-aware match for media server item "${itemTitle}" against "${providerTitle}".`,
    );
  }

  private async matchesProviderDetails(
    item: MediaItem,
    metadataDetails: MetadataDetails,
  ): Promise<boolean> {
    if (this.titlesMatch(item.title, metadataDetails.title)) {
      return true;
    }

    if (this.matchesTitleWithYear(item, metadataDetails)) {
      this.logYearMatch(item.title, metadataDetails.title);
      return true;
    }

    const detailItem = await this.loadItemDetails(item.id);
    if (!detailItem) {
      return false;
    }

    if (this.titlesMatch(detailItem.title, metadataDetails.title)) {
      return true;
    }

    if (this.matchesTitleWithYear(detailItem, metadataDetails)) {
      this.logYearMatch(item.title, metadataDetails.title);
      return true;
    }

    return false;
  }

  private async resolveAllIds(
    ids: ResolvedMediaIds,
    requiredProviderKeys: string[] = [],
    metadataDetails?: MetadataDetails,
  ): Promise<void> {
    if (
      this.providers.some((provider) => provider.extractId(ids) !== undefined)
    ) {
      const resolvedDetails =
        metadataDetails ?? (await this.getDetails(ids, ids.type));

      if (resolvedDetails?.externalIds) {
        this.fillMissingIds(ids, resolvedDetails.externalIds);
      }

      if (this.hasRequiredIds(ids, requiredProviderKeys)) {
        return;
      }
    }

    const providerKeys = new Set(
      this.providers.map((provider) => provider.idKey),
    );
    for (const [key, value] of Object.entries(ids)) {
      if (!value || key === 'type' || providerKeys.has(key)) {
        continue;
      }

      for (const provider of this.getOrderedProviders()) {
        if (provider.extractId(ids) !== undefined) {
          continue;
        }

        const results = await provider.findByExternalId(value, key);
        if (!results?.length) {
          continue;
        }

        for (const result of results) {
          const id = ids.type === 'movie' ? result.movieId : result.tvShowId;
          if (id !== undefined) {
            provider.assignId(ids, id);
          }
        }
      }

      if (this.hasRequiredIds(ids, requiredProviderKeys)) {
        return;
      }
    }
  }
}
