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
  MetadataLookupPolicy,
  metadataLookupPoliciesByService,
} from './interfaces/metadata-lookup-policy.interface';
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
import { MetadataLookupCandidate } from './metadata-lookup.util';

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

  private getLookupPolicyForService(service: string): MetadataLookupPolicy {
    return metadataLookupPoliciesByService[service.toLowerCase()] ?? {};
  }

  /**
   * Validates policy provider keys against all registered providers (not just
   * available ones). An unavailable provider key like 'tvdb' is still valid —
   * it just means the provider isn't configured right now. The "unsupported"
   * warning only fires for completely unknown keys (e.g. a typo).
   */
  private resolveLookupPolicyProviderKeys(
    lookupPolicy: MetadataLookupPolicy = {},
  ): {
    providerKeys: string[];
    hasExplicitRestriction: boolean;
  } {
    const hasExplicitRestriction = Array.isArray(lookupPolicy.providerKeys);

    if (!hasExplicitRestriction) {
      return {
        providerKeys: this.getOrderedProviderKeys(),
        hasExplicitRestriction: false,
      };
    }

    const registeredProviderKeys = new Set(
      this.providers.map((provider) => provider.idKey),
    );

    const providerKeys = lookupPolicy.providerKeys.filter((providerKey) =>
      registeredProviderKeys.has(providerKey),
    );

    if (lookupPolicy.providerKeys.length > 0 && providerKeys.length === 0) {
      this.logger.warn(
        `Metadata lookup policy references only unsupported providers: ${lookupPolicy.providerKeys.join(', ')}`,
      );
    }

    return {
      providerKeys,
      hasExplicitRestriction,
    };
  }

  private buildLookupCandidates(
    ids: Partial<ProviderIds>,
    candidateKeys: string[],
    allowedProviderKeys?: Set<string>,
  ): MetadataLookupCandidate[] {
    const seen = new Set<string>();
    const lookupCandidates: MetadataLookupCandidate[] = [];

    for (const providerKey of candidateKeys) {
      if (seen.has(providerKey)) {
        continue;
      }

      seen.add(providerKey);

      if (allowedProviderKeys && !allowedProviderKeys.has(providerKey)) {
        continue;
      }

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

  private buildLookupCandidatesWithPolicy(
    ids: Partial<ProviderIds>,
    lookupPolicy: MetadataLookupPolicy = {},
  ): MetadataLookupCandidate[] {
    const { providerKeys, hasExplicitRestriction } =
      this.resolveLookupPolicyProviderKeys(lookupPolicy);
    const allowedProviderKeys = hasExplicitRestriction
      ? new Set(providerKeys)
      : undefined;

    return this.buildLookupCandidates(
      ids,
      [...providerKeys, ...Object.keys(ids)],
      allowedProviderKeys,
    );
  }

  public async resolveLookupCandidates(
    mediaServerId: string,
    lookupPolicy: MetadataLookupPolicy,
    fallbackIds: Partial<ProviderIds> = {},
  ): Promise<MetadataLookupCandidate[]> {
    const resolvedIds = await this.resolveIdsWithLookupPolicy(
      mediaServerId,
      lookupPolicy,
    );

    return this.buildLookupCandidatesWithPolicy(
      {
        ...fallbackIds,
        ...resolvedIds,
      },
      lookupPolicy,
    );
  }

  public async resolveLookupCandidatesFromMediaItem(
    item: MediaItem,
    lookupPolicy: MetadataLookupPolicy,
    fallbackIds: Partial<ProviderIds> = {},
  ): Promise<MetadataLookupCandidate[]> {
    const resolvedIds = await this.resolveIdsFromMediaItemWithLookupPolicy(
      item,
      lookupPolicy,
    );

    return this.buildLookupCandidatesWithPolicy(
      {
        ...fallbackIds,
        ...resolvedIds,
      },
      lookupPolicy,
    );
  }

  public async resolveLookupCandidatesForService(
    mediaServerId: string,
    service: string,
    fallbackIds: Partial<ProviderIds> = {},
  ): Promise<MetadataLookupCandidate[]> {
    return this.resolveLookupCandidates(
      mediaServerId,
      this.getLookupPolicyForService(service),
      fallbackIds,
    );
  }

  public async resolveLookupCandidatesFromMediaItemForService(
    item: MediaItem,
    service: string,
    fallbackIds: Partial<ProviderIds> = {},
  ): Promise<MetadataLookupCandidate[]> {
    return this.resolveLookupCandidatesFromMediaItem(
      item,
      this.getLookupPolicyForService(service),
      fallbackIds,
    );
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

  private async resolveIdsFromHierarchyMediaItemInternal(
    item: MediaItem,
    providerKeys: string[] = [],
    providerMatchMode: 'all' | 'any' = 'all',
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

      return this.resolveIdsFromMediaItemInternal(
        resolutionItem,
        providerKeys,
        providerMatchMode,
      );
    } catch (error) {
      this.logger.warn('Failed to resolve IDs from hierarchy media item');
      this.logger.debug(error);
      return undefined;
    }
  }

  private async resolveIdsFromMediaItemInternal(
    item: MediaItem,
    providerKeys: string[] = [],
    providerMatchMode: 'all' | 'any' = 'all',
  ): Promise<ResolvedMediaIds | undefined> {
    try {
      const ids = this.extractDirectIds(item);
      const hasAvailableDirectIds = this.getOrderedProviders().some(
        (provider) => provider.extractId(ids) !== undefined,
      );
      let metadataDetails: MetadataDetails | undefined;

      if (hasAvailableDirectIds) {
        metadataDetails = await this.validateDirectIds(item, ids);

        if (!metadataDetails) {
          return undefined;
        }

        if (metadataDetails.externalIds) {
          this.fillMissingIds(ids, metadataDetails.externalIds);
        }
      }

      if (providerKeys.length === 0) {
        if (hasAvailableDirectIds) {
          return ids;
        }
      } else if (this.hasRequiredIds(ids, providerKeys, providerMatchMode)) {
        return ids;
      }

      await this.resolveAllIds(
        ids,
        providerKeys,
        metadataDetails,
        providerMatchMode,
      );

      return this.hasRequiredIds(ids, providerKeys, providerMatchMode)
        ? ids
        : undefined;
    } catch (error) {
      this.logger.warn('Failed to resolve IDs from media item');
      this.logger.debug(error);
      return undefined;
    }
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
    const normalizedKeys =
      this.normalizeRequiredProviderKeys(requiredProviderKeys);
    const lookupPolicy: MetadataLookupPolicy =
      normalizedKeys.length > 0
        ? { providerKeys: normalizedKeys, providerMatchMode: 'all' }
        : {};

    return this.resolveIdsWithLookupPolicy(mediaServerId, lookupPolicy);
  }

  async resolveIdsForService(
    mediaServerId: string,
    service: string,
  ): Promise<ResolvedMediaIds | undefined> {
    return this.resolveIdsWithLookupPolicy(
      mediaServerId,
      this.getLookupPolicyForService(service),
    );
  }

  public async resolveIdsWithLookupPolicy(
    mediaServerId: string,
    lookupPolicy: MetadataLookupPolicy,
  ): Promise<ResolvedMediaIds | undefined> {
    const { providerKeys, hasExplicitRestriction } =
      this.resolveLookupPolicyProviderKeys(lookupPolicy);

    if (hasExplicitRestriction && providerKeys.length === 0) {
      return undefined;
    }

    try {
      const mediaServer = await this.mediaServerFactory.getService();
      const mediaItem = await mediaServer.getMetadata(mediaServerId);

      if (!mediaItem) {
        this.logger.warn(
          `Failed to fetch metadata for media server item: ${mediaServerId}`,
        );
        return undefined;
      }

      return this.resolveIdsFromHierarchyMediaItemInternal(
        mediaItem,
        providerKeys,
        lookupPolicy.providerMatchMode ?? 'any',
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
    return this.resolveIdsFromHierarchyMediaItemInternal(
      item,
      this.normalizeRequiredProviderKeys(requiredProviderKeys),
      'all',
      sourceMediaServerId,
    );
  }

  async resolveIdsFromMediaItem(
    item: MediaItem,
    requiredProviderKeys?: string | string[],
  ): Promise<ResolvedMediaIds | undefined> {
    const normalizedKeys =
      this.normalizeRequiredProviderKeys(requiredProviderKeys);
    const lookupPolicy: MetadataLookupPolicy =
      normalizedKeys.length > 0
        ? { providerKeys: normalizedKeys, providerMatchMode: 'all' }
        : {};

    return this.resolveIdsFromMediaItemWithLookupPolicy(item, lookupPolicy);
  }

  async resolveIdsFromMediaItemForService(
    item: MediaItem,
    service: string,
  ): Promise<ResolvedMediaIds | undefined> {
    return this.resolveIdsFromMediaItemWithLookupPolicy(
      item,
      this.getLookupPolicyForService(service),
    );
  }

  public async resolveIdsFromMediaItemWithLookupPolicy(
    item: MediaItem,
    lookupPolicy: MetadataLookupPolicy,
  ): Promise<ResolvedMediaIds | undefined> {
    const { providerKeys, hasExplicitRestriction } =
      this.resolveLookupPolicyProviderKeys(lookupPolicy);

    if (hasExplicitRestriction && providerKeys.length === 0) {
      return undefined;
    }

    return this.resolveIdsFromMediaItemInternal(
      item,
      providerKeys,
      lookupPolicy.providerMatchMode ?? 'any',
    );
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

    if (providerResult.result.externalIds) {
      this.applyIdCorrections(
        ids,
        providerResult.result.externalIds,
        providerResult.provider,
      );
    }

    return providerResult.result;
  }

  private applyIdCorrections(
    ids: ProviderIds,
    externalIds: ProviderIds,
    sourceProviderName: string,
    itemTitle?: string,
  ): void {
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

      const target = itemTitle ? ` for "${itemTitle}"` : '';
      this.logger.warn(
        `Corrected ${provider.name} ID${target}: ${currentId} to ${correctId} via ${sourceProviderName} cross-reference. The media server may have incorrect metadata for this item.`,
      );
      provider.assignId(ids, correctId);
    }
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
    matchMode: 'all' | 'any' = 'all',
  ): boolean {
    if (requiredProviderKeys.length > 0) {
      const resolvedRequiredIds = requiredProviderKeys.map((providerKey) => {
        const provider = this.providers.find(
          (item) => item.idKey === providerKey,
        );
        return provider ? provider.extractId(ids) !== undefined : true;
      });

      return matchMode === 'any'
        ? resolvedRequiredIds.some(Boolean)
        : resolvedRequiredIds.every(Boolean);
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

  /**
   * Validate direct provider IDs from the media server by walking the
   * configured providers in preference order. Each provider is asked for
   * details about whatever direct ID it can extract from the item, and
   * the first provider whose release year matches the media server's year
   * "vouches" for the ID set — we return its details and use its external
   * IDs to fill in the other provider slots.
   *
   * This is the ID-primary / year-sanity model:
   *   - The ID is the decisive signal. A successful lookup means the ID
   *     points at a real entry in the authoritative provider for that type.
   *   - The release year is the only sanity check. Titles are deliberately
   *     not compared, because cosmetic title drift (localization, numeral
   *     form, edition suffixes) is normal and comparing them caused the
   *     regressions in #2636 / #2638.
   *   - Cross-provider fallback gives the library a second opinion when
   *     the preferred provider disagrees with the media server on year —
   *     the scenario the metadata settings description already promises
   *     users when they configure TVDB alongside TMDB.
   *
   * Rejection is the fail-closed default when no provider agrees on the
   * year. If the media server has no year signal at all, the first
   * successful provider lookup is trusted (we have nothing to reject with).
   */
  private async validateDirectIds(
    item: MediaItem,
    ids: ResolvedMediaIds,
  ): Promise<MetadataDetails | undefined> {
    const itemYear = this.readItemYear(item);
    const disagreements: string[] = [];
    const consulted = new Set<IMetadataProvider>();

    const evaluate = async (
      provider: IMetadataProvider,
    ): Promise<MetadataDetails | undefined> => {
      if (consulted.has(provider)) return undefined;
      const id = provider.extractId(ids);
      if (id === undefined) return undefined;
      consulted.add(provider);

      const providerDetails = await provider.getDetails(id, ids.type);
      if (!providerDetails) return undefined;

      if (providerDetails.externalIds) {
        this.applyIdCorrections(
          ids,
          providerDetails.externalIds,
          provider.name,
          item.title,
        );
        this.fillMissingIds(ids, providerDetails.externalIds);
      }

      // Missing year on either side: nothing to sanity-check against. We
      // trust the ID, but log so ambiguous accepts stay visible. Provider
      // missing year is the suspicious case (TMDB/TVDB almost always have
      // one) so it's logged at warn; media server missing year is common
      // in untagged libraries and stays at debug.
      if (providerDetails.year === undefined) {
        this.logger.warn(
          `Accepted direct provider IDs for "${item.title}" via ${provider.name} without a year check — ${provider.name} returned no release year for this entry.`,
        );
        return providerDetails;
      }
      if (itemYear === undefined) {
        this.logger.debug(
          `Accepted direct provider IDs for "${item.title}" via ${provider.name} without a year check — media server item has no year.`,
        );
        return providerDetails;
      }

      const delta = Math.abs(itemYear - providerDetails.year);

      if (delta === 0) {
        if (disagreements.length > 0) {
          this.logger.debug(
            `Direct provider IDs for "${item.title}" validated by ${provider.name} (${providerDetails.year}) after year disagreement from: ${disagreements.join(', ')}.`,
          );
        }
        return providerDetails;
      }

      // ±1 tolerance covers festival/theatrical release drift.
      if (delta === 1) {
        this.logger.debug(
          `Accepted direct provider IDs for "${item.title}" (${itemYear}) with a one-year drift from ${provider.name} (${providerDetails.year}).`,
        );
        return providerDetails;
      }

      disagreements.push(`${provider.name} returned ${providerDetails.year}`);
      return undefined;
    };

    // First pass: consult every provider that already has an ID on the item.
    for (const provider of this.getOrderedProviders()) {
      const providerDetails = await evaluate(provider);
      if (providerDetails) return providerDetails;
    }

    // Second pass: if all direct provider IDs disagreed on year, bridge from
    // non-provider external references (for example IMDB) so a configured
    // provider that was not on the item can still vouch.
    if (disagreements.length > 0) {
      await this.bridgeMissingProviderIds(ids);
      for (const provider of this.getOrderedProviders()) {
        const providerDetails = await evaluate(provider);
        if (providerDetails) return providerDetails;
      }
    }

    if (disagreements.length > 0) {
      this.logger.warn(
        `Rejected direct provider IDs for media server item "${item.title}" (${itemYear}) because no configured metadata provider confirmed the release year. Disagreements: ${disagreements.join('; ')}. The media server likely has incorrect metadata for this item, so no external IDs will be returned from this resolution attempt.`,
      );
    }

    return undefined;
  }

  private async bridgeMissingProviderIds(ids: ResolvedMediaIds): Promise<void> {
    const availableProviderKeys = new Set(this.getOrderedProviderKeys());
    for (const [key, value] of Object.entries(ids)) {
      if (!value || key === 'type' || availableProviderKeys.has(key)) {
        continue;
      }
      for (const provider of this.getOrderedProviders()) {
        if (provider.extractId(ids) !== undefined) {
          continue;
        }
        const results = await provider.findByExternalId(value, key);
        if (!results) {
          continue;
        }
        for (const result of results) {
          const id = ids.type === 'movie' ? result.movieId : result.tvShowId;
          if (id !== undefined) {
            provider.assignId(ids, id);
          }
        }
      }
    }
  }

  private async resolveAllIds(
    ids: ResolvedMediaIds,
    requiredProviderKeys: string[] = [],
    metadataDetails?: MetadataDetails,
    providerMatchMode: 'all' | 'any' = 'all',
  ): Promise<void> {
    if (
      this.providers.some((provider) => provider.extractId(ids) !== undefined)
    ) {
      const resolvedDetails =
        metadataDetails ?? (await this.getDetails(ids, ids.type));

      if (resolvedDetails?.externalIds) {
        this.fillMissingIds(ids, resolvedDetails.externalIds);
      }

      if (this.hasRequiredIds(ids, requiredProviderKeys, providerMatchMode)) {
        return;
      }
    }

    const availableProviderKeys = new Set(this.getOrderedProviderKeys());
    for (const [key, value] of Object.entries(ids)) {
      if (!value || key === 'type' || availableProviderKeys.has(key)) {
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

      if (this.hasRequiredIds(ids, requiredProviderKeys, providerMatchMode)) {
        return;
      }
    }
  }
}
