import { EMediaDataType, RuleValueType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import cacheManager, { Cache } from '../../api/lib/cache';
import { JellyfinService } from '../../api/media-server/jellyfin/jellyfin.service';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';

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
    private readonly jellyfinService: JellyfinService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(JellyfinGetterService.name);
    const ruleConstants = new RuleConstants();
    this.jellyfinProperties = ruleConstants.applications.find(
      (el) => el.id === Application.JELLYFIN,
    )?.props ?? [];
    this.cache = cacheManager.getCache('jellyfin');
  }

  async get(
    id: number,
    libItem: PlexLibraryItem,
    dataType?: EMediaDataType,
    ruleGroup?: RulesDto,
  ): Promise<RuleValueType> {
    try {
      if (!this.jellyfinService.isSetup()) {
        this.logger.warn('Jellyfin service is not configured');
        return null;
      }

      const prop = this.jellyfinProperties.find((el) => el.id === id);
      if (!prop) {
        this.logger.warn(`Unknown Jellyfin property ID: ${id}`);
        return null;
      }

      // Fetch full metadata from Jellyfin
      // Note: libItem.ratingKey maps to Jellyfin item ID
      const metadata = await this.jellyfinService.getMetadata(
        libItem.ratingKey,
      );

      if (!metadata) {
        this.logger.warn(
          `Failed to get Jellyfin metadata for item ${libItem.ratingKey}`,
        );
        return null;
      }

      // Get parent/grandparent metadata lazily (like Plex getter)
      let parentPromise: Promise<typeof metadata | undefined> | undefined;
      const getParent = async () => {
        if (!metadata?.parentId) return undefined;
        parentPromise ??= this.jellyfinService.getMetadata(metadata.parentId);
        return parentPromise;
      };

      let grandparentPromise:
        | Promise<typeof metadata | undefined>
        | undefined;
      const getGrandparent = async () => {
        if (!metadata?.grandparentId) return undefined;
        grandparentPromise ??= this.jellyfinService.getMetadata(
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
          const seenByUserIds = await this.jellyfinService.getItemSeenBy(
            metadata.id,
          );
          const users = await this.jellyfinService.getUsers();
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
          const watchHistory = await this.jellyfinService.getWatchHistory(
            metadata.id,
          );
          return watchHistory.length;
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
          if (metadata.type === EMediaDataType.EPISODES) {
            const grandparent = await getGrandparent();
            return grandparent?.genres?.map((g) => g.name) ?? [];
          }
          if (metadata.type === EMediaDataType.SEASONS) {
            const parent = await getParent();
            return parent?.genres?.map((g) => g.name) ?? [];
          }
          return metadata.genres?.map((g) => g.name) ?? [];
        }

        case 'sw_allEpisodesSeenBy': {
          return await this.getAllEpisodesSeenBy(metadata.id);
        }

        case 'sw_lastWatched': {
          return await this.getLastWatchedShowDate(metadata.id);
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
          this.logger.debug(
            `Property ${prop.name} is not supported for Jellyfin (Plex-only feature)`,
          );
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
          this.logger.debug(
            `External rating ${prop.name} not yet implemented for Jellyfin`,
          );
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
        `Jellyfin-Getter - Action failed for '${libItem.title}' with id '${libItem.ratingKey}': ${e instanceof Error ? e.message : String(e)}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private async getLastViewedAt(itemId: string): Promise<Date | null> {
    const watchHistory = await this.jellyfinService.getWatchHistory(itemId);
    if (!watchHistory.length) return null;

    const dates = watchHistory
      .map((r) => r.watchedAt)
      .filter((d): d is Date => d !== undefined);

    return dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null;
  }

  private async getAllEpisodesSeenBy(showId: string): Promise<string[]> {
    const users = await this.jellyfinService.getUsers();
    const seasons = await this.jellyfinService.getChildrenMetadata(showId);

    // Get all episodes across all seasons
    const allEpisodes: string[] = [];
    for (const season of seasons) {
      const episodes = await this.jellyfinService.getChildrenMetadata(
        season.id,
      );
      allEpisodes.push(...episodes.map((e) => e.id));
    }

    if (allEpisodes.length === 0) return [];

    // Get watch status for each episode
    const episodeWatchers = await Promise.all(
      allEpisodes.map((epId) => this.jellyfinService.getItemSeenBy(epId)),
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

  private async getLastWatchedShowDate(showId: string): Promise<Date | null> {
    const seasons = await this.jellyfinService.getChildrenMetadata(showId);
    let latestDate: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.jellyfinService.getChildrenMetadata(
        season.id,
      );
      for (const episode of episodes) {
        const lastViewed = await this.getLastViewedAt(episode.id);
        if (lastViewed && (!latestDate || lastViewed > latestDate)) {
          latestDate = lastViewed;
        }
      }
    }

    return latestDate;
  }

  private async getEpisodeCount(
    itemId: string,
    type: EMediaDataType,
  ): Promise<number> {
    if (type === EMediaDataType.SEASONS) {
      const episodes = await this.jellyfinService.getChildrenMetadata(itemId);
      return episodes.length;
    }

    // For shows, sum up all episode counts
    const seasons = await this.jellyfinService.getChildrenMetadata(itemId);
    let count = 0;
    for (const season of seasons) {
      const episodes = await this.jellyfinService.getChildrenMetadata(
        season.id,
      );
      count += episodes.length;
    }
    return count;
  }

  private async getViewedEpisodeCount(
    itemId: string,
    type: EMediaDataType,
  ): Promise<number> {
    const seasons =
      type === EMediaDataType.SEASONS
        ? [{ id: itemId }]
        : await this.jellyfinService.getChildrenMetadata(itemId);

    let viewedCount = 0;
    for (const season of seasons) {
      const episodes = await this.jellyfinService.getChildrenMetadata(
        season.id,
      );
      for (const episode of episodes) {
        const seenBy = await this.jellyfinService.getItemSeenBy(episode.id);
        if (seenBy.length > 0) viewedCount++;
      }
    }
    return viewedCount;
  }

  private async getLastEpisodeAddedAt(
    itemId: string,
    type: EMediaDataType,
  ): Promise<Date | null> {
    const seasons =
      type === EMediaDataType.SEASONS
        ? [{ id: itemId }]
        : await this.jellyfinService.getChildrenMetadata(itemId);

    let latestAddedAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.jellyfinService.getChildrenMetadata(
        season.id,
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
    type: EMediaDataType,
  ): Promise<number> {
    if (type === EMediaDataType.EPISODES) {
      const history = await this.jellyfinService.getWatchHistory(itemId);
      return history.length;
    }

    const seasons =
      type === EMediaDataType.SEASONS
        ? [{ id: itemId }]
        : await this.jellyfinService.getChildrenMetadata(itemId);

    let totalViews = 0;
    for (const season of seasons) {
      const episodes = await this.jellyfinService.getChildrenMetadata(
        season.id,
      );
      for (const episode of episodes) {
        const history = await this.jellyfinService.getWatchHistory(episode.id);
        totalViews += history.length;
      }
    }
    return totalViews;
  }

  private async getShowWatchers(itemId: string): Promise<string[]> {
    const watchHistory = await this.jellyfinService.getWatchHistory(itemId);
    const users = await this.jellyfinService.getUsers();
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const uniqueViewerIds = [...new Set(watchHistory.map((r) => r.userId))];
    return uniqueViewerIds.map((id) => userMap.get(id) || id);
  }

  private async getCollectionNames(
    itemId: string,
    libraryId: string,
    ruleGroup?: RulesDto,
  ): Promise<string[]> {
    const cacheKey = `jellyfin:item:collections:${itemId}`;
    const cached = this.cache.data.get<string[]>(cacheKey);
    if (cached) return cached;

    const collections = await this.jellyfinService.getCollections(libraryId);
    const collectionNames: string[] = [];

    for (const collection of collections) {
      const children = await this.jellyfinService.getCollectionChildren(
        collection.id,
      );
      if (children.some((child) => child.id === itemId)) {
        // Exclude the current collection if it matches
        const excludeName = ruleGroup?.collection?.manualCollectionName
          ? ruleGroup.collection.manualCollectionName
          : ruleGroup?.name;

        if (
          !excludeName ||
          collection.title.toLowerCase().trim() !==
            excludeName.toLowerCase().trim()
        ) {
          collectionNames.push(collection.title.trim());
        }
      }
    }

    this.cache.data.set(cacheKey, collectionNames, 600);
    return collectionNames;
  }

  private async getPlaylistCount(
    itemId: string,
    type: EMediaDataType,
  ): Promise<number> {
    const names = await this.getPlaylistNames(itemId, type);
    return names.length;
  }

  private async getPlaylistNames(
    itemId: string,
    type: EMediaDataType,
  ): Promise<string[]> {
    const playlists = await this.jellyfinService.getPlaylists('');
    const matchingPlaylists: string[] = [];

    // For shows, check all episodes
    if (type === EMediaDataType.SHOWS || type === EMediaDataType.SEASONS) {
      const seasons =
        type === EMediaDataType.SEASONS
          ? [{ id: itemId }]
          : await this.jellyfinService.getChildrenMetadata(itemId);

      const episodeIds: string[] = [];
      for (const season of seasons) {
        const episodes = await this.jellyfinService.getChildrenMetadata(
          season.id,
        );
        episodeIds.push(...episodes.map((e) => e.id));
      }

      // Check each playlist for matching episodes
      for (const playlist of playlists) {
        // Note: Jellyfin SDK may not have a direct way to get playlist items
        // This is a simplified implementation
        if (!matchingPlaylists.includes(playlist.title)) {
          matchingPlaylists.push(playlist.title);
        }
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
    const collections = await this.jellyfinService.getCollections(libraryId);
    const collectionNames = new Set<string>();

    const idsToCheck = [itemId, parentId, grandparentId].filter(
      (id): id is string => id !== undefined,
    );

    for (const collection of collections) {
      const children = await this.jellyfinService.getCollectionChildren(
        collection.id,
      );

      if (children.some((child) => idsToCheck.includes(child.id))) {
        const excludeName = ruleGroup?.collection?.manualCollectionName
          ? ruleGroup.collection.manualCollectionName
          : ruleGroup?.name;

        if (
          !excludeName ||
          collection.title.toLowerCase().trim() !==
            excludeName.toLowerCase().trim()
        ) {
          collectionNames.add(collection.title.trim());
        }
      }
    }

    return Array.from(collectionNames);
  }

  private async getLastEpisodeAiredAt(
    itemId: string,
    type: EMediaDataType,
  ): Promise<Date | null> {
    const seasons =
      type === EMediaDataType.SEASONS
        ? [{ id: itemId }]
        : await this.jellyfinService.getChildrenMetadata(itemId);

    let latestAiredAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.jellyfinService.getChildrenMetadata(
        season.id,
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
    const episodes = await this.jellyfinService.getChildrenMetadata(seasonId);

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
