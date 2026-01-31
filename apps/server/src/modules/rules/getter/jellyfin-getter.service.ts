import {
  isMediaType,
  MediaItem,
  MediaItemType,
  RuleValueType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import cacheManager, { Cache } from '../../api/lib/cache';
import { JellyfinAdapterService } from '../../api/media-server/jellyfin/jellyfin-adapter.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';
import { buildCollectionExcludeNames } from '../helpers/collection-exclude.helper';

/**
 * Jellyfin Getter Service
 *
 * Implements property getters for Jellyfin media server.
 * Mirrors PlexGetterService functionality for Jellyfin.
 *
 * Key differences from Plex:
 * - Watch history requires iterating over all users (no central endpoint)
 * - Collections are called "BoxSets"
 * - Tags in Jellyfin = Labels in Plex
 * - No watchlist API (returns null for watchlist properties)
 * - Uses ticks for duration (1 tick = 100 nanoseconds)
 */
@Injectable()
export class JellyfinGetterService {
  jellyfinProperties: Property[];
  private readonly cache: Cache;

  constructor(
    private readonly jellyfinAdapter: JellyfinAdapterService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(JellyfinGetterService.name);
    const ruleConstants = new RuleConstants();
    this.jellyfinProperties =
      ruleConstants.applications.find((el) => el.id === Application.JELLYFIN)
        ?.props ?? [];
    this.cache = cacheManager.getCache('jellyfin');
  }

  async get(
    id: number,
    libItem: MediaItem,
    dataType?: MediaItemType,
    ruleGroup?: RulesDto,
  ): Promise<RuleValueType> {
    try {
      if (!this.jellyfinAdapter.isSetup()) {
        this.logger.warn('Jellyfin service is not configured');
        return null;
      }

      const prop = this.jellyfinProperties.find((el) => el.id === id);
      if (!prop) {
        this.logger.warn(`Unknown Jellyfin property ID: ${id}`);
        return null;
      }

      // Fetch full metadata from Jellyfin
      // Note: libItem.id maps to Jellyfin item ID
      const metadata = await this.jellyfinAdapter.getMetadata(libItem.id);

      if (!metadata) {
        this.logger.warn(
          `Failed to get Jellyfin metadata for item ${libItem.id}`,
        );
        return null;
      }

      // Get parent/grandparent metadata lazily (like Plex getter)
      let parentPromise: Promise<typeof metadata | undefined> | undefined;
      const getParent = async () => {
        if (!metadata?.parentId) return undefined;
        parentPromise ??= this.jellyfinAdapter.getMetadata(metadata.parentId);
        return parentPromise;
      };

      let grandparentPromise: Promise<typeof metadata | undefined> | undefined;
      const getGrandparent = async () => {
        if (!metadata?.grandparentId) return undefined;
        grandparentPromise ??= this.jellyfinAdapter.getMetadata(
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
          const seenByUserIds = await this.jellyfinAdapter.getItemSeenBy(
            metadata.id,
          );
          const users = await this.jellyfinAdapter.getUsers();
          const userMap = new Map(users.map((u) => [u.id, u.name]));
          return seenByUserIds.map((id) => userMap.get(id) || id);
        }

        case 'releaseDate': {
          return metadata.originallyAvailableAt
            ? new Date(metadata.originallyAvailableAt)
            : null;
        }

        case 'rating_critics': {
          // Jellyfin CriticRating is on a 0-100 scale, normalize to 0-10
          const criticRating = metadata.ratings?.find(
            (r) => r.type === 'critic',
          )?.value;
          return criticRating !== undefined ? criticRating / 10 : 0;
        }

        case 'rating_audience': {
          // Jellyfin CommunityRating is already 0-10 scale
          const audienceRating = metadata.ratings?.find(
            (r) => r.type === 'audience',
          )?.value;
          return audienceRating ?? 0;
        }

        case 'rating_user': {
          // Jellyfin user ratings - return first available user rating
          return metadata.userRating ?? 0;
        }

        case 'people': {
          return metadata.actors?.map((a) => a.name) ?? null;
        }

        case 'viewCount': {
          // Get total view count from watch history
          const watchHistory = await this.jellyfinAdapter.getWatchHistory(
            metadata.id,
          );
          return watchHistory.length;
        }

        case 'playCount': {
          // Get total play attempts across all users (includes unfinished views)
          return await this.jellyfinAdapter.getTotalPlayCount(metadata.id);
        }

        case 'labels': {
          // Jellyfin Tags = Plex Labels
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
          // For shows/seasons, Jellyfin doesn't store LastPlayedDate on the parent item
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
          return await this.getLastWatchedShowDate(metadata.id, metadata.type);
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
          return await this.jellyfinAdapter.getTotalPlayCount(metadata.id);
        }

        case 'sw_watchers': {
          return await this.getShowWatchers(metadata.id);
        }

        case 'collection_names': {
          return await this.getCollectionNames(
            metadata.id,
            metadata.library.id,
            ruleGroup,
          );
        }

        case 'playlists': {
          return await this.getPlaylistCount(metadata.id, metadata.type);
        }

        case 'playlist_names': {
          return await this.getPlaylistNames(metadata.id, metadata.type);
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

        // Plex-only features - not supported in Jellyfin
        case 'watchlist_isListedByUsers':
        case 'watchlist_isWatchlisted': {
          return prop.name === 'watchlist_isWatchlisted' ? false : [];
        }

        // Rating properties that need external data (like IMDb, RT, TMDB)
        // Jellyfin may have these in ProviderIds but not as live ratings
        case 'rating_imdb':
        case 'rating_rottenTomatoesCritic':
        case 'rating_rottenTomatoesAudience':
        case 'rating_tmdb':
        case 'rating_imdbShow':
        case 'rating_rottenTomatoesCriticShow':
        case 'rating_rottenTomatoesAudienceShow':
        case 'rating_tmdbShow': {
          // These would require external API calls
          // For now, return null (not supported)
          return null;
        }

        // Smart collection properties - Jellyfin doesn't have smart collections
        case 'collectionsIncludingSmart':
        case 'sw_collections_including_parent_and_smart':
        case 'sw_collection_names_including_parent_and_smart':
        case 'collection_names_including_smart': {
          // Fall back to normal collection count/names
          // Jellyfin doesn't distinguish between smart and regular collections
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

        default: {
          this.logger.warn(`Unhandled Jellyfin property: ${prop.name}`);
          return null;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Jellyfin-Getter - Action failed for '${libItem.title}' with id '${libItem.id}': ${e instanceof Error ? e.message : String(e)}`,
      );
      return undefined;
    }
  }

  private async getLastViewedAt(itemId: string): Promise<Date | null> {
    const watchHistory = await this.jellyfinAdapter.getWatchHistory(itemId);
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
    const users = await this.jellyfinAdapter.getUsers();

    // Get all episodes - handle both shows and seasons
    const allEpisodes: string[] = [];
    if (type === 'season') {
      // For seasons, get episodes directly (children of season)
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
        itemId,
        'episode',
      );
      allEpisodes.push(...episodes.map((e) => e.id));
    } else {
      // For shows, get seasons first, then episodes from each season
      const seasons = await this.jellyfinAdapter.getChildrenMetadata(
        itemId,
        'season',
      );
      for (const season of seasons) {
        const episodes = await this.jellyfinAdapter.getChildrenMetadata(
          season.id,
          'episode',
        );
        allEpisodes.push(...episodes.map((e) => e.id));
      }
    }

    if (allEpisodes.length === 0) return [];

    // Get watch status for each episode
    const episodeWatchers = await Promise.all(
      allEpisodes.map((epId) => this.jellyfinAdapter.getItemSeenBy(epId)),
    );

    // Find users who appear in ALL episode watch lists
    const allUserIds = new Set(users.map((u) => u.id));
    const usersWhoWatchedAll = [...allUserIds].filter((userId) =>
      episodeWatchers.every((watchers) => watchers.includes(userId)),
    );

    // Map to usernames
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    return usersWhoWatchedAll.map((id) => userMap.get(id) || id);
  }

  private async getLastWatchedShowDate(
    itemId: string,
    type: MediaItemType,
  ): Promise<Date | null> {
    let latestDate: Date | null = null;

    if (type === 'season') {
      // For seasons, get episodes directly
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
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
      const seasons = await this.jellyfinAdapter.getChildrenMetadata(
        itemId,
        'season',
      );
      for (const season of seasons) {
        const episodes = await this.jellyfinAdapter.getChildrenMetadata(
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
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
        itemId,
        'episode',
      );
      return episodes.length;
    }

    // For shows, sum up all episode counts
    const seasons = await this.jellyfinAdapter.getChildrenMetadata(
      itemId,
      'season',
    );
    let count = 0;
    for (const season of seasons) {
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
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
        : await this.jellyfinAdapter.getChildrenMetadata(itemId, 'season');

    let viewedCount = 0;
    for (const season of seasons) {
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const seenBy = await this.jellyfinAdapter.getItemSeenBy(episode.id);
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
        : await this.jellyfinAdapter.getChildrenMetadata(itemId, 'season');

    let latestAddedAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
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
      const history = await this.jellyfinAdapter.getWatchHistory(itemId);
      return history.length;
    }

    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.jellyfinAdapter.getChildrenMetadata(itemId, 'season');

    let totalViews = 0;
    for (const season of seasons) {
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const history = await this.jellyfinAdapter.getWatchHistory(episode.id);
        totalViews += history.length;
      }
    }
    return totalViews;
  }

  private async getShowWatchers(itemId: string): Promise<string[]> {
    const watchHistory = await this.jellyfinAdapter.getWatchHistory(itemId);
    const users = await this.jellyfinAdapter.getUsers();
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const uniqueViewerIds = [...new Set(watchHistory.map((r) => r.userId))];
    return uniqueViewerIds.map((id) => userMap.get(id) || id);
  }

  private async getCollectionNames(
    itemId: string,
    libraryId: string,
    ruleGroup?: RulesDto,
  ): Promise<string[]> {
    // Cache the raw collection names (without exclusion filtering)
    // so we can apply different exclusions for different rule groups
    const cacheKey = `jellyfin:item:collections:${itemId}`;
    let allCollectionNames = this.cache.data.get<string[]>(cacheKey);

    if (!allCollectionNames) {
      const collections = await this.jellyfinAdapter.getCollections(libraryId);
      allCollectionNames = [];

      for (const collection of collections) {
        const children = await this.jellyfinAdapter.getCollectionChildren(
          collection.id,
        );

        if (children.some((child) => child.id === itemId)) {
          allCollectionNames.push(collection.title.trim());
        }
      }

      this.cache.data.set(cacheKey, allCollectionNames, 600);
    }

    const excludeNames = buildCollectionExcludeNames(ruleGroup);
    return excludeNames.length > 0
      ? allCollectionNames.filter(
          (name) => !excludeNames.includes(name.toLowerCase().trim()),
        )
      : allCollectionNames;
  }

  private async getPlaylistCount(
    itemId: string,
    type: MediaItemType,
  ): Promise<number> {
    const names = await this.getPlaylistNames(itemId, type);
    return names.length;
  }

  private async getPlaylistNames(
    itemId: string,
    type: MediaItemType,
  ): Promise<string[]> {
    const playlists = await this.jellyfinAdapter.getPlaylists('');
    const matchingPlaylists: string[] = [];

    // Build set of IDs to match against playlist contents
    const targetIds = new Set<string>();

    if (type === 'show' || type === 'season') {
      // For shows/seasons: collect all episode IDs
      const seasons =
        type === 'season'
          ? [{ id: itemId }]
          : await this.jellyfinAdapter.getChildrenMetadata(itemId, 'season');

      for (const season of seasons) {
        const episodes = await this.jellyfinAdapter.getChildrenMetadata(
          season.id,
          'episode',
        );
        episodes.forEach((e) => targetIds.add(e.id));
      }
    } else {
      // For movies/episodes: just match the item itself
      targetIds.add(itemId);
    }

    // Check each playlist for matching items
    for (const playlist of playlists) {
      const items = await this.jellyfinAdapter.getPlaylistItems(playlist.id);
      if (items.some((item) => targetIds.has(item.id))) {
        matchingPlaylists.push(playlist.title);
      }
    }

    return matchingPlaylists;
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
    const collections = await this.jellyfinAdapter.getCollections(libraryId);
    const collectionNames = new Set<string>();

    const idsToCheck = [itemId, parentId, grandparentId].filter(
      (id): id is string => id !== undefined,
    );

    const excludeNames = buildCollectionExcludeNames(ruleGroup);

    for (const collection of collections) {
      const children = await this.jellyfinAdapter.getCollectionChildren(
        collection.id,
      );

      const hasMatch = children.some((child) => idsToCheck.includes(child.id));

      if (hasMatch) {
        const collectionNameLower = collection.title.toLowerCase().trim();
        if (!excludeNames.includes(collectionNameLower)) {
          collectionNames.add(collection.title.trim());
        }
      }
    }

    return Array.from(collectionNames);
  }

  private async getLastEpisodeAiredAt(
    itemId: string,
    type: MediaItemType,
  ): Promise<Date | null> {
    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.jellyfinAdapter.getChildrenMetadata(itemId, 'season');

    let latestAiredAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
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
    const episodes = await this.jellyfinAdapter.getChildrenMetadata(
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
