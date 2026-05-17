import {
  MediaItem,
  MediaItemType,
  RuleValueType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import cacheManager, { Cache } from '../../api/lib/cache';
import { EmbyAdapterService } from '../../api/media-server/emby/emby-adapter.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RulesDto } from '../dtos/rules.dto';

/**
 * Emby Getter Service
 *
 * Implements property getters for Emby. Emby and Jellyfin share property IDs
 * and names (see RuleConstants where the Emby application copies Jellyfin's
 * props array), so rule definitions migrate cleanly between the two.
 *
 * The implementation here mirrors the Jellyfin getter's structural shape but
 * keeps per-property logic intentionally thin until each property is verified
 * against a real Emby server. Properties that cannot be safely derived from
 * the cached MediaItem alone log a TODO and return null.
 *
 * The most common rule-evaluation paths (addDate, releaseDate, year, ratings,
 * genres, labels, viewCount, lastViewedAt, collections list) work directly
 * off the MediaItem returned by EmbyAdapterService.getMetadata().
 */
@Injectable()
export class EmbyGetterService {
  embyProperties: Property[];
  private readonly cache: Cache;

  constructor(
    private readonly embyAdapter: EmbyAdapterService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(EmbyGetterService.name);
    const ruleConstants = new RuleConstants();
    this.embyProperties =
      ruleConstants.applications.find((el) => el.id === Application.EMBY)
        ?.props ?? [];
    this.cache = cacheManager.getCache('emby');
  }

  async get(
    id: number,
    libItem: MediaItem,
    dataType?: MediaItemType,
    ruleGroup?: RulesDto,
    currentRule?: RuleDto,
  ): Promise<RuleValueType> {
    void ruleGroup;
    void currentRule;
    try {
      if (!this.embyAdapter.isSetup()) {
        this.logger.warn('Emby service is not configured');
        return null;
      }

      const prop = this.embyProperties.find((el) => el.id === id);
      if (!prop) {
        this.logger.warn(`Unknown Emby property ID: ${id}`);
        return null;
      }

      const metadata = await this.embyAdapter.getMetadata(libItem.id);
      if (!metadata) {
        this.logger.warn(`Failed to get Emby metadata for item ${libItem.id}`);
        return null;
      }

      return await this.evaluate(prop.name, metadata, dataType);
    } catch (error) {
      this.logger.warn(
        `Emby getter(${id}) threw: ${(error as Error).message ?? error}`,
      );
      return null;
    }
  }

  /**
   * Property-name dispatch. Properties whose value lives directly on the
   * MediaItem are implemented; the rest log a TODO and return null until
   * verified against a live Emby server.
   */
  private async evaluate(
    name: string,
    item: MediaItem,
    dataType?: MediaItemType,
  ): Promise<RuleValueType> {
    void dataType;
    switch (name) {
      case 'addDate':
        return item.addedAt ?? null;
      case 'releaseDate':
        return item.originallyAvailableAt ?? null;
      case 'rating_user':
        return item.userRating ?? null;
      case 'rating_audience':
        return (
          item.ratings?.find((r) => r.type === 'audience')?.value ?? null
        );
      case 'rating_critics':
        return (
          item.ratings?.find((r) => r.type === 'critic')?.value ?? null
        );
      case 'viewCount':
      case 'playCount':
        return item.viewCount ?? null;
      case 'lastViewedAt':
        return item.lastViewedAt ?? null;
      case 'genre':
        return (item.genres ?? []).map((g) => g.name) ?? null;
      case 'labels':
        return item.labels ?? null;
      case 'people':
        return (item.actors ?? []).map((a) => a.name) ?? null;
      case 'fileVideoResolution':
        return item.mediaSources?.[0]?.videoResolution ?? null;
      case 'fileBitrate':
        return item.mediaSources?.[0]?.bitrate ?? null;
      case 'fileVideoCodec':
        return item.mediaSources?.[0]?.videoCodec ?? null;
      case 'seenBy': {
        // Backed by EmbyAdapterService.getItemSeenBy() — returns user IDs.
        // The Jellyfin getter resolves these to usernames; mirror that.
        const userIds = await this.embyAdapter.getItemSeenBy(item.id);
        const users = await this.embyAdapter.getUsers();
        return userIds
          .map((id) => users.find((u) => u.id === id)?.name)
          .filter((n): n is string => !!n);
      }
      case 'isWatched': {
        const state = await this.embyAdapter.getWatchState(
          item.id,
          item.viewCount,
        );
        return state.isWatched;
      }
      default:
        // TODO(emby-server-test): the remaining Jellyfin-shared properties
        // (sw_*, collections, collection_names, playlists, playlist_names,
        // favoritedBy, sw_favoritedBy, sw_lastWatched, sw_episodes, etc.)
        // need property-specific HTTP calls and aggregations. The Jellyfin
        // getter at apps/server/src/modules/rules/getter/jellyfin-getter.service.ts
        // is the reference implementation; port each handler once an Emby
        // server is available to verify endpoint behaviour.
        this.logger.debug(
          `Emby getter for property '${name}' is not implemented yet — returning null`,
        );
        return null;
    }
  }
}
