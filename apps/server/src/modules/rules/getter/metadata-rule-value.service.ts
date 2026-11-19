import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MetadataService } from '../../metadata/metadata.service';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';

const FRANCHISE_PROPERTIES = [
  'franchise_name',
  'franchise_nextReleaseDate',
] as const;

export type FranchiseProperty = (typeof FRANCHISE_PROPERTIES)[number];

export const isFranchiseProperty = (
  name: string | undefined,
): name is FranchiseProperty =>
  FRANCHISE_PROPERTIES.includes(name as FranchiseProperty);

/**
 * Shared resolution for rule properties sourced from the metadata layer rather
 * than the configured media server. Studios deliberately reads the metadata
 * providers (TMDB) instead of the server's own studio field: Plex stores a
 * single string while Jellyfin/Emby store a list, so the metadata layer is the
 * only source that yields one canonical TEXT_LIST value with identical
 * semantics on all three servers (and therefore clean cross-server rule
 * migration). Seasons and episodes resolve to their show's value.
 *
 * Contract: undefined = the lookup failed or no provider id could be resolved
 * (the comparator protects the item); [] = the provider record confirms no
 * studios.
 */
@Injectable()
export class MetadataRuleValueService {
  constructor(private readonly metadataService: MetadataService) {}

  async getStudios(
    item: MediaItem,
    arrLookupCache?: ArrLookupCache,
  ): Promise<string[] | undefined> {
    const resolve = async (): Promise<string[] | undefined> => {
      const ids =
        await this.metadataService.resolveIdsFromHierarchyMediaItem(item);
      if (!ids) {
        return undefined;
      }

      const details = await this.metadataService.getDetails(ids, ids.type, {
        merge: true,
      });
      return details?.studios;
    };

    return arrLookupCache
      ? arrLookupCache.memoize(
          `metadata:studios:${this.getCacheItemId(item)}`,
          resolve,
          (studios) => studios === undefined,
        )
      : resolve();
  }

  /**
   * Franchise properties (movies). Only a part with a release date counts as
   * upcoming: TMDB keeps announced films without a date for years, and
   * counting them would protect a movie indefinitely.
   *
   * null = does not apply (not a movie, in no franchise, no dated upcoming
   * part); undefined = a lookup failed (the comparator skips the item).
   */
  async getFranchiseValue(
    property: FranchiseProperty,
    item: MediaItem,
    arrLookupCache?: ArrLookupCache,
  ): Promise<string | Date | null | undefined> {
    if (item.type !== 'movie') {
      return null;
    }

    const resolve = async () => {
      // Only TMDB answers, so a TVDB-only match must still find the TMDB id.
      const ids = await this.metadataService.resolveIdsFromHierarchyMediaItem(
        item,
        'tmdb',
      );
      if (!ids || ids.type !== 'movie') {
        return undefined;
      }

      return this.metadataService.getFranchise(ids);
    };

    const franchise = arrLookupCache
      ? await arrLookupCache.memoize(
          `metadata:franchise:${item.id}`,
          resolve,
          (value) => value === undefined,
        )
      : await resolve();
    if (franchise === undefined) {
      return undefined;
    }

    if (property === 'franchise_name') {
      return franchise?.name ?? null;
    }

    const now = Date.now();
    const next = (franchise?.otherPartReleaseDates ?? [])
      .map((releaseDate) => new Date(releaseDate))
      .filter((date) => date.getTime() > now)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return next ?? null;
  }

  private getCacheItemId(item: MediaItem): string {
    if (item.type === 'episode') {
      return item.grandparentId ?? item.id;
    }
    if (item.type === 'season') {
      return item.parentId ?? item.id;
    }
    return item.id;
  }
}
