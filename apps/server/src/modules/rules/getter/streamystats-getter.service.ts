import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { StreamystatsApiService } from '../../api/streamystats-api/streamystats-api.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { definedUniqueValues } from '../helpers/rule-property.helper';

/**
 * Resolves Streamystats-backed rule properties for Jellyfin. Streamystats is
 * the Jellyfin analog of Tautulli: an optional companion service that
 * contributes its own rule Application. Properties surface membership of
 * Streamystats watchlists (a "users curated this" protection signal).
 *
 * Only PUBLIC watchlists are visible to Maintainerr — see
 * StreamystatsWatchlistMembership for why. Usernames are resolved through the
 * server-agnostic media-server abstraction (Jellyfin is the only configured
 * server when this getter runs, since the Application is gated to it).
 */
@Injectable()
export class StreamystatsGetterService {
  appProperties: Property[];

  constructor(
    private readonly streamystatsApi: StreamystatsApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(StreamystatsGetterService.name);
    const ruleConstants = new RuleConstants();
    this.appProperties = ruleConstants.applications.find(
      (el) => el.id === Application.STREAMYSTATS,
    ).props;
  }

  async get(id: number, libItem: MediaItem) {
    try {
      const prop = this.appProperties.find((el) => el.id === id);
      if (!prop) {
        return null;
      }

      const membership = await this.streamystatsApi.getWatchlistMembership();
      // `undefined` is the transient signal: Streamystats is unconfigured or
      // unreachable, so skip rather than report a false "not watchlisted".
      if (!membership) {
        return undefined;
      }

      const itemIds = await this.resolveWatchlistItemIds(prop.name, libItem);
      // `undefined` when the parent chain couldn't be resolved — skip rather
      // than fall back to an item-only check, which would defeat the parent
      // variant and could let a protected item match a destructive rule.
      if (!itemIds) {
        return undefined;
      }

      const owners = definedUniqueValues(
        itemIds.flatMap((itemId) => membership.ownersByItemId[itemId] ?? []),
      );

      switch (prop.name) {
        case 'isInWatchlist':
        case 'isInWatchlist_including_parent': {
          return owners.length > 0;
        }
        case 'watchlistedByUsers':
        case 'watchlistedByUsers_including_parent': {
          if (owners.length === 0) {
            return [];
          }
          // undefined when usernames couldn't be resolved (transient skip).
          return await this.resolveUsernames(owners);
        }
        default: {
          return null;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Streamystats-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(
        `Streamystats-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
        error,
      );
      return undefined;
    }
  }

  /**
   * The Jellyfin item IDs to check for watchlist membership. The base props
   * check the item alone. The `_including_parent` variants additionally roll
   * in the parent show (and season) for a season/episode — a Streamystats list
   * holds the show item ID, not its seasons, so a season would otherwise never
   * inherit its watchlisted show.
   *
   * Parents are resolved through the media server's `getMetadata` (the same
   * canonical path the other getters use) so the parent IDs come from the
   * mapper's hierarchy resolution — `SeriesId` for seasons, not the
   * library-folder `parentId`. Gated on the server-agnostic `type` so a movie
   * is never rolled up. Returns `undefined` when metadata can't be fetched, so
   * the caller skips rather than falling back to an item-only check.
   */
  private async resolveWatchlistItemIds(
    propName: string,
    libItem: MediaItem,
  ): Promise<string[] | undefined> {
    if (!propName.endsWith('_including_parent')) {
      return [libItem.id];
    }

    const mediaServer = await this.mediaServerFactory.getService();
    const metadata = await mediaServer.getMetadata(libItem.id);
    if (!metadata) {
      return undefined;
    }

    // Only seasons/episodes have a parent show to inherit from; gate on the
    // server-agnostic type so a movie's library-folder parentId is never
    // rolled up. definedUniqueValues drops the undefined parent/grandparent.
    const ancestors =
      metadata.type === 'season' || metadata.type === 'episode'
        ? [metadata.parentId, metadata.grandparentId]
        : [];
    return definedUniqueValues([metadata.id, ...ancestors]);
  }

  private async resolveUsernames(
    userIds: string[],
  ): Promise<string[] | undefined> {
    const mediaServer = await this.mediaServerFactory.getService();
    const users = await mediaServer.getUsers();
    // getUsers() is fail-closed (returns [] on error). A public watchlist is
    // always owned by a user, so an empty user list while we have owners to
    // resolve means the lookup failed — surface that as undefined (transient
    // skip) rather than an empty list, which would otherwise flip negative
    // list comparisons and could let protected items match destructive rules.
    if (users.length === 0) {
      return undefined;
    }

    const namesById = new Map(users.map((user) => [user.id, user.name]));
    return userIds.reduce((acc, userId) => {
      const name = namesById.get(userId);
      if (name) {
        acc.push(name);
      }
      return acc;
    }, [] as string[]);
  }
}
