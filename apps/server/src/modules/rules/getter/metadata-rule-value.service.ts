import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MetadataService } from '../../metadata/metadata.service';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';

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
