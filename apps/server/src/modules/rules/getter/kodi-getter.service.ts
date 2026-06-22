import {
  isMediaType,
  MediaItem,
  MediaItemType,
  RuleValueType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import cacheManager, { Cache } from '../../api/lib/cache';
import { KodiAdapterService } from '../../api/media-server/kodi/kodi-adapter.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';
import {
  filterRuleCollectionNames,
  mapRuleUserIdsToNames,
} from '../helpers/rule-property.helper';

/**
 * Kodi Getter Service
 *
 * Implements rule property getters for Kodi. The property surface mirrors the
 * Jellyfin/Emby getter verbatim (same property IDs) so rule migration between
 * servers is a no-op; the logic is built entirely on the shared
 * IMediaServerService contract, so it carries over unchanged against the Kodi
 * adapter.
 *
 * Kodi-specific behaviour (handled by the adapter, transparent here):
 * - Single-user model: seenBy/watcher properties resolve to one synthetic user;
 *   favourites are unsupported and return empty.
 * - No central watch history — watch state is per-item playcount/lastplayed.
 * - Collections are tag-backed (movie/show) or shadow-indexed (season/episode).
 * - No watchlist API (returns null/false for watchlist properties).
 */
@Injectable()
export class KodiGetterService {
  kodiProperties: Property[];
  private readonly cache: Cache;

  constructor(
    private readonly kodiAdapter: KodiAdapterService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(KodiGetterService.name);
    const ruleConstants = new RuleConstants();
    this.kodiProperties =
      ruleConstants.applications.find((el) => el.id === Application.KODI)
        ?.props ?? [];
    this.cache = cacheManager.getCache('kodi');
  }

  async get(
    id: number,
    libItem: MediaItem,
    dataType?: MediaItemType,
    ruleGroup?: RulesDto,
  ): Promise<RuleValueType> {
    try {
      if (!this.kodiAdapter.isSetup()) {
        this.logger.warn('Kodi service is not configured');
        return null;
      }

      const prop = this.kodiProperties.find((el) => el.id === id);
      if (!prop) {
        this.logger.warn(`Unknown Kodi property ID: ${id}`);
        return null;
      }

      // Fetch full metadata from Kodi
      // Note: libItem.id maps to Kodi item ID
      const metadata = await this.kodiAdapter.getMetadata(libItem.id);

      if (!metadata) {
        this.logger.warn(`Failed to get Kodi metadata for item ${libItem.id}`);
        return null;
      }

      // Get parent/grandparent metadata lazily (like Plex getter)
      let parentPromise: Promise<typeof metadata | undefined> | undefined;
      const getParent = async () => {
        if (!metadata?.parentId) return undefined;
        parentPromise ??= this.kodiAdapter.getMetadata(metadata.parentId);
        return parentPromise;
      };

      let grandparentPromise: Promise<typeof metadata | undefined> | undefined;
      const getGrandparent = async () => {
        if (!metadata?.grandparentId) return undefined;
        grandparentPromise ??= this.kodiAdapter.getMetadata(
          metadata.grandparentId,
        );
        return grandparentPromise;
      };

      switch (prop.name) {
        case 'addDate': {
          return metadata.addedAt ? new Date(metadata.addedAt) : null;
        }

        case 'seenBy': {
          // Get users who have watched this item
          const seenByUserIds = await this.kodiAdapter.getItemSeenBy(
            metadata.id,
          );
          const users = await this.kodiAdapter.getUsers();
          return mapRuleUserIdsToNames(
            seenByUserIds,
            users,
            (user) => user.id,
            (user) => user.name,
          );
        }

        case 'releaseDate': {
          return metadata.originallyAvailableAt
            ? new Date(metadata.originallyAvailableAt)
            : null;
        }

        case 'rating_critics': {
          const criticRating = metadata.ratings?.find(
            (r) => r.type === 'critic',
          )?.value;
          return criticRating ?? 0;
        }

        case 'rating_audience': {
          // Kodi CommunityRating is already 0-10 scale
          const audienceRating = metadata.ratings?.find(
            (r) => r.type === 'audience',
          )?.value;
          return audienceRating ?? 0;
        }

        case 'rating_user': {
          // Kodi user ratings - return first available user rating
          return metadata.userRating ?? 0;
        }

        case 'people': {
          return metadata.actors?.map((a) => a.name) ?? null;
        }

        case 'viewCount': {
          const watchState = await this.kodiAdapter.getWatchState(metadata.id);
          return watchState.viewCount;
        }

        case 'isWatched': {
          const watchState = await this.kodiAdapter.getWatchState(metadata.id);
          return watchState.isWatched;
        }

        case 'playCount': {
          // Get total play attempts across all users (includes unfinished views)
          return await this.kodiAdapter.getTotalPlayCount(metadata.id);
        }

        case 'labels': {
          // Kodi Tags = Plex Labels
          return metadata.labels ?? [];
        }

        case 'collections': {
          // Number of collections this item is in
          const collectionNames = await this.getCollectionNames(
            metadata.id,
            metadata.library.id,
            ruleGroup,
          );
          return collectionNames.length;
        }

        case 'lastViewedAt': {
          // For shows/seasons, Kodi doesn't store LastPlayedDate on the parent item
          // We need to aggregate from episodes
          if (
            isMediaType(metadata.type, 'show') ||
            isMediaType(metadata.type, 'season')
          ) {
            return await this.getLastWatchedShowDate(
              metadata.id,
              metadata.type,
            );
          }
          return await this.getLastViewedAt(metadata.id);
        }

        case 'fileVideoResolution': {
          return metadata.mediaSources?.[0]?.videoResolution ?? null;
        }

        case 'fileBitrate': {
          return metadata.mediaSources?.[0]?.bitrate ?? 0;
        }

        case 'fileVideoCodec': {
          return metadata.mediaSources?.[0]?.videoCodec ?? null;
        }

        case 'genre': {
          // For episodes/seasons, get genres from the show
          if (isMediaType(metadata.type, 'episode')) {
            const grandparent = await getGrandparent();
            return grandparent?.genres?.map((g) => g.name) ?? [];
          }
          if (isMediaType(metadata.type, 'season')) {
            const parent = await getParent();
            return parent?.genres?.map((g) => g.name) ?? [];
          }
          return metadata.genres?.map((g) => g.name) ?? [];
        }

        case 'sw_allEpisodesSeenBy': {
          return await this.getAllEpisodesSeenBy(metadata.id, metadata.type);
        }

        case 'sw_lastWatched': {
          return await this.getNewestWatchedEpisodeDate(
            metadata.id,
            metadata.type,
          );
        }

        case 'sw_episodes': {
          return await this.getEpisodeCount(metadata.id, metadata.type);
        }

        case 'sw_viewedEpisodes': {
          return await this.getViewedEpisodeCount(metadata.id, metadata.type);
        }

        case 'sw_lastEpisodeAddedAt': {
          return await this.getLastEpisodeAddedAt(metadata.id, metadata.type);
        }

        case 'sw_amountOfViews': {
          return await this.getTotalShowViews(metadata.id, metadata.type);
        }

        case 'sw_playCount': {
          // For episodes, get total play attempts (includes unfinished views)
          return await this.kodiAdapter.getTotalPlayCount(metadata.id);
        }

        // At season/show level this returns the UNION of users that watched
        // any descendant episode — not the intersection. A user who watched
        // 3/6 episodes is included. This is the documented behaviour and is
        // covered by the #2559 regression test in
        // jellyfin-getter.service.spec.ts. Use `sw_allEpisodesSeenBy` when
        // you need "watched every episode" semantics instead.
        case 'sw_watchers': {
          return await this.getSwWatchers(metadata.id, metadata.type);
        }

        case 'collection_names': {
          return await this.getCollectionNames(
            metadata.id,
            metadata.library.id,
            ruleGroup,
          );
        }

        case 'sw_collections_including_parent': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          return await this.getCollectionsIncludingParent(
            metadata.id,
            parent?.id,
            grandparent?.id,
            metadata.library.id,
            ruleGroup,
          );
        }

        case 'sw_collection_names_including_parent': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          return await this.getCollectionNamesIncludingParent(
            metadata.id,
            parent?.id,
            grandparent?.id,
            metadata.library.id,
            ruleGroup,
          );
        }

        case 'sw_lastEpisodeAiredAt': {
          return await this.getLastEpisodeAiredAt(metadata.id, metadata.type);
        }

        // Plex-only features - not supported in Kodi
        case 'watchlist_isListedByUsers':
        case 'watchlist_isWatchlisted': {
          return prop.name === 'watchlist_isWatchlisted' ? false : [];
        }

        // Rating properties - Kodi provides CommunityRating and CriticRating.
        // CommunityRating is provider-dependent and is not guaranteed to be IMDb-specific.
        // CriticRating is typically from Rotten Tomatoes (0-100 scale, stored as 0-10 after mapping).
        case 'rating_imdb':
        case 'rating_tmdb': {
          // Both rules fall back to Kodi CommunityRating because the API does not
          // expose a dedicated IMDb numeric rating field.
          const communityRating = metadata.ratings?.find(
            (r) => r.source === 'community',
          );
          return communityRating?.value ?? null;
        }

        case 'rating_rottenTomatoesCritic': {
          const criticRating = metadata.ratings?.find(
            (r) => r.source === 'critic' && r.type === 'critic',
          );
          return criticRating?.value ?? null;
        }

        case 'rating_rottenTomatoesAudience': {
          // Kodi doesn't expose RT audience ratings separately
          // Could fall back to community rating as an approximation
          const communityRating = metadata.ratings?.find(
            (r) => r.source === 'community',
          );
          return communityRating?.value ?? null;
        }

        case 'rating_imdbShow':
        case 'rating_tmdbShow': {
          const showMetadata =
            metadata.type === 'season'
              ? await getParent()
              : metadata.type === 'episode'
                ? await getGrandparent()
                : null;
          if (!showMetadata) return null;
          const communityRating = showMetadata.ratings?.find(
            (r) => r.source === 'community',
          );
          return communityRating?.value ?? null;
        }

        case 'rating_rottenTomatoesCriticShow': {
          const showMetadata =
            metadata.type === 'season'
              ? await getParent()
              : metadata.type === 'episode'
                ? await getGrandparent()
                : null;
          if (!showMetadata) return null;
          const criticRating = showMetadata.ratings?.find(
            (r) => r.source === 'critic' && r.type === 'critic',
          );
          return criticRating?.value ?? null;
        }

        case 'rating_rottenTomatoesAudienceShow': {
          const showMetadata =
            metadata.type === 'season'
              ? await getParent()
              : metadata.type === 'episode'
                ? await getGrandparent()
                : null;
          if (!showMetadata) return null;
          const communityRating = showMetadata.ratings?.find(
            (r) => r.source === 'community',
          );
          return communityRating?.value ?? null;
        }

        // Smart collection properties — Kodi has no native smart collections
        // (TheMovieDb-driven "Automatic Creation of Collections" is metadata
        // grouping, not filter rules; the third-party Smart Playlists plugin
        // is out of scope here). Fall back to normal collection count/names,
        // same as the Jellyfin getter does.
        case 'collectionsIncludingSmart':
        case 'sw_collections_including_parent_and_smart':
        case 'sw_collection_names_including_parent_and_smart':
        case 'collection_names_including_smart': {
          if (
            prop.name === 'collectionsIncludingSmart' ||
            prop.name === 'sw_collections_including_parent_and_smart'
          ) {
            const collectionNames = await this.getCollectionNames(
              metadata.id,
              metadata.library.id,
              ruleGroup,
            );
            return collectionNames.length;
          }
          return await this.getCollectionNames(
            metadata.id,
            metadata.library.id,
            ruleGroup,
          );
        }

        case 'sw_seasonLastEpisodeAiredAt': {
          const parent = await getParent();
          if (!parent) return null;
          return await this.getSeasonLastEpisodeAiredAt(parent.id);
        }

        case 'collection_siblings_lastViewedAt': {
          // Aggregate "last view date" across every movie that shares an Kodi
          // BoxSet (collection) with this item. Mirrors the Plex implementation:
          // one recently-watched sibling keeps the whole set from being deleted
          // together.
          return await this.getCollectionSiblingsLastViewedAt(
            metadata.id,
            metadata.library.id,
            ruleGroup,
          );
        }

        default: {
          this.logger.warn(`Unhandled Kodi property: ${prop.name}`);
          return null;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Kodi-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  private async getLastViewedAt(itemId: string): Promise<Date | null> {
    const watchHistory = await this.kodiAdapter.getWatchHistory(itemId);
    if (!watchHistory.length) {
      return null;
    }

    const dates = watchHistory
      .map((r) => r.watchedAt)
      .filter((d): d is Date => d !== undefined);

    return dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null;
  }

  private async getAllEpisodesSeenBy(
    itemId: string,
    type: MediaItemType,
  ): Promise<string[]> {
    const users = await this.kodiAdapter.getUsers();

    // Get all episodes - handle both shows and seasons
    const allEpisodes: string[] = [];
    if (type === 'season') {
      // For seasons, get episodes directly (children of season)
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        itemId,
        'episode',
      );
      allEpisodes.push(...episodes.map((e) => e.id));
    } else {
      // For shows, get seasons first, then episodes from each season
      const seasons = await this.kodiAdapter.getChildrenMetadata(
        itemId,
        'season',
      );
      for (const season of seasons) {
        const episodes = await this.kodiAdapter.getChildrenMetadata(
          season.id,
          'episode',
        );
        allEpisodes.push(...episodes.map((e) => e.id));
      }
    }

    if (allEpisodes.length === 0) return [];

    // Get watch status for each episode
    const episodeWatchers = await Promise.all(
      allEpisodes.map((epId) => this.kodiAdapter.getItemSeenBy(epId)),
    );

    // Find users who appear in ALL episode watch lists
    const allUserIds = new Set(users.map((u) => u.id));
    const usersWhoWatchedAll = [...allUserIds].filter((userId) =>
      episodeWatchers.every((watchers) => watchers.includes(userId)),
    );

    return mapRuleUserIdsToNames(
      usersWhoWatchedAll,
      users,
      (user) => user.id,
      (user) => user.name,
    );
  }

  /**
   * Return the view date of the highest-numbered episode that has been
   * watched within the highest-numbered season that has any watches, or
   * null when nothing has been watched. Matches the Plex/Tautulli
   * `sw_lastWatched` semantic: "view date of the newest watched episode".
   */
  private async getNewestWatchedEpisodeDate(
    itemId: string,
    type: MediaItemType,
  ): Promise<Date | null> {
    const seasons: Array<{ id: string }> =
      type === 'season'
        ? [{ id: itemId }]
        : await this.kodiAdapter.getChildrenMetadata(itemId, 'season');

    const watched: Array<{
      parentIndex: number;
      index: number;
      viewedAt: Date;
    }> = [];

    for (const season of seasons) {
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const episodeOrder = episode.indexEnd ?? episode.index;

        if (episodeOrder === undefined || episode.parentIndex === undefined) {
          continue;
        }
        const viewedAt = await this.getLastViewedAt(episode.id);
        if (!viewedAt) continue;
        watched.push({
          parentIndex: episode.parentIndex,
          index: episodeOrder,
          viewedAt,
        });
      }
    }

    if (watched.length === 0) return null;

    watched.sort((a, b) =>
      b.parentIndex !== a.parentIndex
        ? b.parentIndex - a.parentIndex
        : b.index - a.index,
    );

    return watched[0].viewedAt;
  }

  /**
   * Return the most recent `LastPlayedDate` found across every episode of a
   * show or season, or null when nothing has been watched. Kodi does not
   * expose a watched timestamp on the parent item, so the only way to derive
   * a "last watched" signal for shows/seasons is to walk the children and
   * take the max. This is an aggregate — it is not the view date of the
   * highest-numbered episode, the way the Plex/Tautulli `sw_lastWatched`
   * getters compute it. Used by the `lastViewedAt` rule only.
   */
  private async getLastWatchedShowDate(
    itemId: string,
    type: MediaItemType,
  ): Promise<Date | null> {
    let latestDate: Date | null = null;

    if (type === 'season') {
      // For seasons, get episodes directly
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        itemId,
        'episode',
      );
      for (const episode of episodes) {
        const lastViewed = await this.getLastViewedAt(episode.id);
        if (lastViewed && (!latestDate || lastViewed > latestDate)) {
          latestDate = lastViewed;
        }
      }
    } else {
      // For shows, iterate through seasons first
      const seasons = await this.kodiAdapter.getChildrenMetadata(
        itemId,
        'season',
      );
      for (const season of seasons) {
        const episodes = await this.kodiAdapter.getChildrenMetadata(
          season.id,
          'episode',
        );
        for (const episode of episodes) {
          const lastViewed = await this.getLastViewedAt(episode.id);
          if (lastViewed && (!latestDate || lastViewed > latestDate)) {
            latestDate = lastViewed;
          }
        }
      }
    }

    return latestDate;
  }

  private async getEpisodeCount(
    itemId: string,
    type: MediaItemType,
  ): Promise<number> {
    if (type === 'season') {
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        itemId,
        'episode',
      );
      return episodes.length;
    }

    // For shows, sum up all episode counts
    const seasons = await this.kodiAdapter.getChildrenMetadata(
      itemId,
      'season',
    );
    let count = 0;
    for (const season of seasons) {
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      count += episodes.length;
    }
    return count;
  }

  private async getViewedEpisodeCount(
    itemId: string,
    type: MediaItemType,
  ): Promise<number> {
    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.kodiAdapter.getChildrenMetadata(itemId, 'season');

    let viewedCount = 0;
    for (const season of seasons) {
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const seenBy = await this.kodiAdapter.getItemSeenBy(episode.id);
        if (seenBy.length > 0) viewedCount++;
      }
    }
    return viewedCount;
  }

  private async getLastEpisodeAddedAt(
    itemId: string,
    type: MediaItemType,
  ): Promise<Date | null> {
    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.kodiAdapter.getChildrenMetadata(itemId, 'season');

    let latestAddedAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        if (
          episode.addedAt &&
          (!latestAddedAt || episode.addedAt > latestAddedAt)
        ) {
          latestAddedAt = episode.addedAt;
        }
      }
    }

    return latestAddedAt;
  }

  private async getTotalShowViews(
    itemId: string,
    type: MediaItemType,
  ): Promise<number> {
    if (type === 'episode') {
      const history = await this.kodiAdapter.getWatchHistory(itemId);
      return history.length;
    }

    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.kodiAdapter.getChildrenMetadata(itemId, 'season');

    let totalViews = 0;
    for (const season of seasons) {
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const history = await this.kodiAdapter.getWatchHistory(episode.id);
        totalViews += history.length;
      }
    }
    return totalViews;
  }

  private async getSwWatchers(
    itemId: string,
    type: MediaItemType,
  ): Promise<string[]> {
    let watcherIds: string[];

    switch (type) {
      case 'episode': {
        watcherIds = await this.kodiAdapter.getItemSeenBy(itemId);
        break;
      }

      case 'season':
      case 'show': {
        watcherIds =
          await this.kodiAdapter.getDescendantEpisodeWatchers(itemId);
        break;
      }

      default: {
        return [];
      }
    }

    const users = await this.kodiAdapter.getUsers();
    return mapRuleUserIdsToNames(
      watcherIds,
      users,
      (user) => user.id,
      (user) => user.name,
    );
  }

  private async getCollectionNames(
    itemId: string,
    libraryId: string,
    ruleGroup?: RulesDto,
  ): Promise<string[]> {
    // Cache the raw collection names (without exclusion filtering)
    // so we can apply different exclusions for different rule groups
    const cacheKey = `kodi:item:collections:${itemId}`;
    let allCollectionNames = this.cache.data.get<string[]>(cacheKey);

    if (!allCollectionNames) {
      const collections = await this.kodiAdapter.getCollections(libraryId);
      allCollectionNames = [];

      for (const collection of collections) {
        const children = await this.kodiAdapter.getCollectionChildren(
          collection.id,
        );

        if (children.some((child) => child.id === itemId)) {
          allCollectionNames.push(collection.title.trim());
        }
      }

      this.cache.data.set(cacheKey, allCollectionNames, 600);
    }

    return filterRuleCollectionNames(allCollectionNames, ruleGroup);
  }

  private async getCollectionsIncludingParent(
    itemId: string,
    parentId: string | undefined,
    grandparentId: string | undefined,
    libraryId: string,
    ruleGroup?: RulesDto,
  ): Promise<number> {
    const names = await this.getCollectionNamesIncludingParent(
      itemId,
      parentId,
      grandparentId,
      libraryId,
      ruleGroup,
    );
    return names.length;
  }

  private async getCollectionNamesIncludingParent(
    itemId: string,
    parentId: string | undefined,
    grandparentId: string | undefined,
    libraryId: string,
    ruleGroup?: RulesDto,
  ): Promise<string[]> {
    const collections = await this.kodiAdapter.getCollections(libraryId);
    const collectionNames: string[] = [];

    const idsToCheck = [itemId, parentId, grandparentId].filter(
      (id): id is string => id !== undefined,
    );

    for (const collection of collections) {
      const children = await this.kodiAdapter.getCollectionChildren(
        collection.id,
      );

      const hasMatch = children.some((child) => idsToCheck.includes(child.id));

      if (hasMatch) {
        collectionNames.push(collection.title);
      }
    }

    return Array.from(
      new Set(filterRuleCollectionNames(collectionNames, ruleGroup)),
    );
  }

  private async getCollectionSiblingsLastViewedAt(
    itemId: string,
    libraryId: string,
    ruleGroup?: RulesDto,
  ): Promise<Date | null> {
    const collections = await this.kodiAdapter.getCollections(libraryId);
    const includedCollectionNames = new Set(
      filterRuleCollectionNames(
        collections.map((collection) => collection.title),
        ruleGroup,
      ),
    );

    let latestMs = 0;
    for (const collection of collections) {
      if (!includedCollectionNames.has(collection.title.trim())) {
        continue;
      }

      const children = await this.kodiAdapter.getCollectionChildren(
        collection.id,
      );
      if (!children.some((child) => child.id === itemId)) {
        continue;
      }

      for (const child of children) {
        // getWatchHistory aggregates LastPlayedDate across all Kodi users
        // (unlike child.lastViewedAt which is scoped to the admin user).
        const history = await this.kodiAdapter.getWatchHistory(child.id);
        for (const record of history) {
          const watchedMs = record.watchedAt?.getTime() ?? 0;
          if (watchedMs > latestMs) {
            latestMs = watchedMs;
          }
        }
      }
    }

    return latestMs > 0 ? new Date(latestMs) : null;
  }

  private async getLastEpisodeAiredAt(
    itemId: string,
    type: MediaItemType,
  ): Promise<Date | null> {
    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.kodiAdapter.getChildrenMetadata(itemId, 'season');

    let latestAiredAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.kodiAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        if (
          episode.originallyAvailableAt &&
          (!latestAiredAt || episode.originallyAvailableAt > latestAiredAt)
        ) {
          latestAiredAt = episode.originallyAvailableAt;
        }
      }
    }

    return latestAiredAt;
  }

  private async getSeasonLastEpisodeAiredAt(
    seasonId: string,
  ): Promise<Date | null> {
    const episodes = await this.kodiAdapter.getChildrenMetadata(
      seasonId,
      'episode',
    );

    let latestAiredAt: Date | null = null;
    for (const episode of episodes) {
      if (
        episode.originallyAvailableAt &&
        (!latestAiredAt || episode.originallyAvailableAt > latestAiredAt)
      ) {
        latestAiredAt = episode.originallyAvailableAt;
      }
    }

    return latestAiredAt;
  }
}
