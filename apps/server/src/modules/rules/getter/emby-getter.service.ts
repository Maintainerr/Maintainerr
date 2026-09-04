import {
  isMediaType,
  MediaItem,
  MediaItemType,
  RuleValueType,
  WatchRecord,
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
import { RuleGroupDto } from '../dtos/ruleGroup.dto';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import {
  filterRuleCollectionNames,
  isValidDate,
  isWatchedAfter,
  mapRuleUserIdsToNames,
} from '../helpers/rule-property.helper';
import { MetadataRuleValueService } from './metadata-rule-value.service';

/**
 * Emby Getter Service
 *
 * Implements property getters for Emby media server.
 * Mirrors PlexGetterService functionality for Emby. Emby and Jellyfin share
 * the same .NET BoxSet backend, so the quirks below are inherited from that
 * lineage and largely match the Jellyfin getter - they're not Emby-specific.
 *
 * Key differences from Plex:
 * - Watch history requires iterating over all users (no central endpoint)
 * - Collections are called "BoxSets"
 * - Tags in Emby = Labels in Plex
 * - No watchlist API (returns null for watchlist properties)
 * - Uses ticks for duration (1 tick = 100 nanoseconds)
 */
@Injectable()
export class EmbyGetterService {
  embyProperties: Property[];
  private readonly cache: Cache;

  constructor(
    private readonly embyAdapter: EmbyAdapterService,
    private readonly metadataRuleValueService: MetadataRuleValueService,
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
    ruleGroup?: RuleGroupDto,
    arrLookupCache?: ArrLookupCache,
  ): Promise<RuleValueType> {
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

      if (prop.name === 'studios') {
        return await this.metadataRuleValueService.getStudios(
          libItem,
          arrLookupCache,
        );
      }

      // Fetch full metadata from Emby
      // Note: libItem.id maps to Emby item ID
      const metadata = await this.embyAdapter.getMetadata(libItem.id);

      if (!metadata) {
        this.logger.warn(`Failed to get Emby metadata for item ${libItem.id}`);
        // undefined, not null: getMetadata answers undefined for both a
        // missing item and a failed read, and null is the comparator's
        // "confirmed absent" signal - it would let NOT_EXISTS match on a
        // transient blip. Mirrors the arr getter contract (#3125).
        return undefined;
      }

      // Get parent/grandparent metadata lazily (like Plex getter)
      let parentPromise: Promise<typeof metadata | undefined> | undefined;
      const getParent = async () => {
        if (!metadata?.parentId) return undefined;
        parentPromise ??= this.embyAdapter.getMetadata(metadata.parentId);
        return parentPromise;
      };

      let grandparentPromise: Promise<typeof metadata | undefined> | undefined;
      const getGrandparent = async () => {
        if (!metadata?.grandparentId) return undefined;
        grandparentPromise ??= this.embyAdapter.getMetadata(
          metadata.grandparentId,
        );
        return grandparentPromise;
      };

      switch (prop.name) {
        case 'addDate': {
          return isValidDate(metadata.addedAt)
            ? new Date(metadata.addedAt)
            : null;
        }

        case 'seenBy': {
          // Get users who have watched this item
          const seenByUserIds = await this.embyAdapter.getItemSeenBy(
            metadata.id,
          );
          const users = await this.embyAdapter.getUsers();
          return mapRuleUserIdsToNames(
            seenByUserIds,
            users,
            (user) => user.id,
            (user) => user.name,
          );
        }

        case 'favoritedBy': {
          const favoritedByUserIds = await this.embyAdapter.getItemFavoritedBy(
            metadata.id,
          );
          const users = await this.embyAdapter.getUsers();
          return mapRuleUserIdsToNames(
            favoritedByUserIds,
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
          // Emby CommunityRating is already 0-10 scale
          const audienceRating = metadata.ratings?.find(
            (r) => r.type === 'audience',
          )?.value;
          return audienceRating ?? 0;
        }

        case 'rating_user': {
          // Emby user ratings - return first available user rating
          return metadata.userRating ?? 0;
        }

        case 'people': {
          return metadata.actors?.map((a) => a.name) ?? null;
        }

        case 'viewCount': {
          const watchState = await this.embyAdapter.getWatchState(metadata.id);
          return watchState.viewCount;
        }

        case 'isWatched': {
          const watchState = await this.embyAdapter.getWatchState(metadata.id);
          return watchState.isWatched;
        }

        case 'playCount': {
          // Get total play attempts across all users (includes unfinished views)
          return await this.embyAdapter.getTotalPlayCount(metadata.id);
        }

        case 'labels': {
          // Emby Tags = Plex Labels
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
          // For shows/seasons, Emby doesn't store LastPlayedDate on the parent item
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

        case 'lastPlayedAt': {
          // Get newest play attempt across all users (includes unfinished views)
          return await this.getLastPlayedAt(metadata.id, metadata.type);
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

        case 'sw_allEpisodesSeenBy':
        case 'sw_allEpisodesSeenBySinceAdded': {
          return await this.getAllEpisodesSeenBy(
            metadata.id,
            metadata.type,
            prop.name === 'sw_allEpisodesSeenBySinceAdded'
              ? this.getAddedAtCutoff(metadata.addedAt)
              : undefined,
          );
        }

        case 'sw_lastWatched': {
          return await this.getNewestWatchedEpisodeDate(
            metadata.id,
            metadata.type,
          );
        }

        case 'sw_lastViewedAtThroughSeason': {
          // Does not apply is an answer, not a failed read (#3402) - see the
          // Plex getter.
          if (metadata.type !== 'season') {
            return null;
          }

          const targetSeason = metadata.index;
          const showId = metadata.parentId;
          // Emby files episodes it cannot place under a "Season Unknown" with
          // no IndexNumber. Such a season has no position in the run of
          // seasons, so the value cannot be computed - hold the item, but that
          // is normal library shape and must not read as a failed lookup.
          if (targetSeason === undefined) {
            this.logger.debug(
              `'${libItem.title}' has no season number, so a view date through it cannot be computed`,
            );
            return undefined;
          }
          if (
            !Number.isSafeInteger(targetSeason) ||
            targetSeason < 0 ||
            typeof showId !== 'string' ||
            !showId
          ) {
            throw new Error('Emby season metadata is missing its valid scope');
          }

          const readSeasons = () =>
            this.embyAdapter.getChildrenMetadata(showId, 'season', true);
          const seasons = await (arrLookupCache?.memoize(
            `emby:show-seasons:${showId}`,
            readSeasons,
          ) ?? readSeasons());
          let latestWatchedAt: Date | null = null;

          for (const season of seasons) {
            const seasonIndex = season.index;
            if (seasonIndex === undefined) continue;
            if (!Number.isSafeInteger(seasonIndex) || seasonIndex < 0) {
              throw new Error('Emby returned an invalid season index');
            }

            const qualifies =
              targetSeason === 0
                ? seasonIndex === 0
                : seasonIndex > 0 && seasonIndex <= targetSeason;
            if (!qualifies) continue;
            if (!season.id) {
              throw new Error('Emby returned a season without an id');
            }

            const readWatchedAt = () =>
              this.getLastWatchedShowDate(season.id, 'season', true);
            const watchedAt = await (arrLookupCache?.memoize(
              `emby:season-view-date:${season.id}`,
              readWatchedAt,
            ) ?? readWatchedAt());
            if (
              watchedAt &&
              (!latestWatchedAt || watchedAt > latestWatchedAt)
            ) {
              latestWatchedAt = watchedAt;
            }
          }

          return latestWatchedAt;
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
          return await this.embyAdapter.getTotalPlayCount(metadata.id);
        }

        case 'sw_favoritedBy': {
          const favoritedByUserIds = await this.embyAdapter.getItemFavoritedBy(
            metadata.id,
          );
          const users = await this.embyAdapter.getUsers();
          return mapRuleUserIdsToNames(
            favoritedByUserIds,
            users,
            (user) => user.id,
            (user) => user.name,
          );
        }

        case 'sw_favoritedBy_including_parent': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          const favoritedByUserIds = await this.getFavoritedByIncludingParent(
            metadata.id,
            parent?.id,
            grandparent?.id,
          );
          const users = await this.embyAdapter.getUsers();
          return mapRuleUserIdsToNames(
            favoritedByUserIds,
            users,
            (user) => user.id,
            (user) => user.name,
          );
        }

        // At season/show level this returns the UNION of users that watched
        // any descendant episode - not the intersection. A user who watched
        // 3/6 episodes is included. This is the documented behaviour and is
        // covered by the #2559 regression test in
        // jellyfin-getter.service.spec.ts. Use `sw_allEpisodesSeenBy` when
        // you need "watched every episode" semantics instead.
        case 'sw_watchers':
        case 'sw_watchersSinceAdded': {
          return await this.getSwWatchers(
            metadata.id,
            metadata.type,
            prop.name === 'sw_watchersSinceAdded'
              ? this.getAddedAtCutoff(metadata.addedAt)
              : undefined,
          );
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

        // Plex-only features - not supported in Emby
        case 'watchlist_isListedByUsers':
        case 'watchlist_isWatchlisted': {
          return prop.name === 'watchlist_isWatchlisted' ? false : [];
        }

        // Rating properties - Emby provides CommunityRating and CriticRating.
        // CommunityRating is provider-dependent and is not guaranteed to be IMDb-specific.
        // CriticRating is typically from Rotten Tomatoes (0-100 scale, stored as 0-10 after mapping).
        case 'rating_imdb':
        case 'rating_tmdb': {
          // Both rules fall back to Emby CommunityRating because the API does not
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
          // Emby doesn't expose RT audience ratings separately
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

        // Smart collection properties - Emby has no native smart collections
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
          // Aggregate "last view date" across every movie that shares an Emby
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
          this.logger.warn(`Unhandled Emby property: ${prop.name}`);
          return null;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Emby-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  private async getLastViewedAt(itemId: string): Promise<Date | null> {
    const watchHistory = await this.embyAdapter.getWatchHistory(itemId);
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

  private async getLastPlayedAt(
    itemId: string,
    type: MediaItemType,
  ): Promise<Date | null> {
    if (!isMediaType(type, 'show') && !isMediaType(type, 'season')) {
      return this.embyAdapter.getLastPlayedAt(itemId);
    }

    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.embyAdapter.getChildrenMetadata(itemId, 'season', true);
    let latestDate: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.embyAdapter.getChildrenMetadata(
        season.id,
        'episode',
        true,
      );
      for (const episode of episodes) {
        const lastPlayedAt = await this.embyAdapter.getLastPlayedAt(episode.id);
        if (lastPlayedAt && (!latestDate || lastPlayedAt > latestDate)) {
          latestDate = lastPlayedAt;
        }
      }
    }

    return latestDate;
  }

  private async getAllEpisodesSeenBy(
    itemId: string,
    type: MediaItemType,
    watchedAfter?: Date,
  ): Promise<string[]> {
    const users = await this.embyAdapter.getUsers(watchedAfter !== undefined);
    const episodeWatchers = Object.values(
      await this.descendantWatchHistory(itemId, type, watchedAfter),
    );

    if (episodeWatchers.length === 0) return [];

    // Users who appear in EVERY episode's watch list
    const usersWhoWatchedAll = users
      .map((user) => user.id)
      .filter((userId) =>
        episodeWatchers.every((records) =>
          records.some((record) => record.userId === userId),
        ),
      );

    return mapRuleUserIdsToNames(
      usersWhoWatchedAll,
      users,
      (user) => user.id,
      (user) => user.name,
    );
  }

  private getAddedAtCutoff(addedAt: Date): Date {
    if (!isValidDate(addedAt)) {
      throw new Error('Emby metadata has an invalid addedAt timestamp');
    }
    return addedAt;
  }

  private async descendantWatchHistory(
    itemId: string,
    type: MediaItemType,
    watchedAfter?: Date,
  ): Promise<Record<string, WatchRecord[]>> {
    if (!isMediaType(type, 'show') && !isMediaType(type, 'season')) {
      return {};
    }

    const watchHistory =
      await this.embyAdapter.getDescendantEpisodeWatchHistory(
        itemId,
        isMediaType(type, 'season') ? 'season' : 'show',
      );

    if (watchedAfter === undefined) return watchHistory;

    return Object.fromEntries(
      Object.entries(watchHistory).map(([episodeId, records]) => [
        episodeId,
        records.filter((record) => isWatchedAfter(record, watchedAfter)),
      ]),
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
        : await this.embyAdapter.getChildrenMetadata(itemId, 'season');

    const watched: Array<{
      parentIndex: number;
      index: number;
      viewedAt: Date;
    }> = [];

    for (const season of seasons) {
      const episodes = await this.embyAdapter.getChildrenMetadata(
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
   * show or season, or null when nothing has been watched. Emby does not
   * expose a watched timestamp on the parent item, so the only way to derive
   * a "last watched" signal for shows/seasons is to walk the children and
   * take the max. This is an aggregate - it is not the view date of the
   * highest-numbered episode, the way the Plex/Tautulli `sw_lastWatched`
   * getters compute it. Used by `lastViewedAt` and the season-prefix rule.
   */
  private async getLastWatchedShowDate(
    itemId: string,
    type: MediaItemType,
    throwOnError = false,
  ): Promise<Date | null> {
    let latestDate: Date | null = null;

    if (type === 'season') {
      // For seasons, get episodes directly
      const episodes = await this.embyAdapter.getChildrenMetadata(
        itemId,
        'episode',
        throwOnError,
      );
      for (const episode of episodes) {
        if (throwOnError && !episode.id) {
          throw new Error('Emby returned an episode without an id');
        }
        const lastViewed = await this.getLastViewedAt(episode.id);
        if (
          throwOnError &&
          lastViewed &&
          !Number.isFinite(lastViewed.getTime())
        ) {
          throw new Error('Emby returned an invalid watch date');
        }
        if (lastViewed && (!latestDate || lastViewed > latestDate)) {
          latestDate = lastViewed;
        }
      }
    } else {
      // For shows, iterate through seasons first
      const seasons = await this.embyAdapter.getChildrenMetadata(
        itemId,
        'season',
      );
      for (const season of seasons) {
        const episodes = await this.embyAdapter.getChildrenMetadata(
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
      const episodes = await this.embyAdapter.getChildrenMetadata(
        itemId,
        'episode',
      );
      return episodes.length;
    }

    // For shows, sum up all episode counts
    const seasons = await this.embyAdapter.getChildrenMetadata(
      itemId,
      'season',
    );
    let count = 0;
    for (const season of seasons) {
      const episodes = await this.embyAdapter.getChildrenMetadata(
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
        : await this.embyAdapter.getChildrenMetadata(itemId, 'season');

    let viewedCount = 0;
    for (const season of seasons) {
      const episodes = await this.embyAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const seenBy = await this.embyAdapter.getItemSeenBy(episode.id);
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
        : await this.embyAdapter.getChildrenMetadata(itemId, 'season');

    let latestAddedAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.embyAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        if (
          isValidDate(episode.addedAt) &&
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
      const history = await this.embyAdapter.getWatchHistory(itemId);
      return history.length;
    }

    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.embyAdapter.getChildrenMetadata(itemId, 'season');

    let totalViews = 0;
    for (const season of seasons) {
      const episodes = await this.embyAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const history = await this.embyAdapter.getWatchHistory(episode.id);
        totalViews += history.length;
      }
    }
    return totalViews;
  }

  private async getSwWatchers(
    itemId: string,
    type: MediaItemType,
    watchedAfter?: Date,
  ): Promise<string[]> {
    const users = await this.embyAdapter.getUsers(watchedAfter !== undefined);
    let watcherIds: string[];

    switch (type) {
      case 'episode': {
        watcherIds = await this.embyAdapter.getItemSeenBy(itemId);
        break;
      }

      case 'season':
      case 'show': {
        if (watchedAfter === undefined) {
          watcherIds =
            await this.embyAdapter.getDescendantEpisodeWatchers(itemId);
          break;
        }
        // The bulk IsPlayed listing carries no dates, so a dated union reads
        // the per-episode records like sw_allEpisodesSeenBy does.
        const watched = new Set(
          Object.values(
            await this.descendantWatchHistory(itemId, type, watchedAfter),
          ).flatMap((records) => records.map((record) => record.userId)),
        );
        watcherIds = users
          .map((user) => user.id)
          .filter((userId) => watched.has(userId));
        break;
      }

      default: {
        return [];
      }
    }

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
    ruleGroup?: RuleGroupDto,
  ): Promise<string[]> {
    // Cache the raw collection names (without exclusion filtering)
    // so we can apply different exclusions for different rule groups
    const cacheKey = `emby:item:collections:${itemId}`;
    let allCollectionNames = this.cache.data.get<string[]>(cacheKey);

    if (!allCollectionNames) {
      const collections = await this.embyAdapter.getCollections(libraryId);
      allCollectionNames = [];

      for (const collection of collections) {
        const children = await this.embyAdapter.getCollectionChildren(
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

  private async getFavoritedByIncludingParent(
    itemId: string,
    parentId: string | undefined,
    grandparentId: string | undefined,
  ): Promise<string[]> {
    const idsToCheck = [...new Set([itemId, parentId, grandparentId])].filter(
      (id): id is string => id !== undefined,
    );

    const favoritedByUserIds = new Set<string>();
    for (const id of idsToCheck) {
      const users = await this.embyAdapter.getItemFavoritedBy(id);
      users.forEach((userId) => favoritedByUserIds.add(userId));
    }

    return Array.from(favoritedByUserIds);
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
    const playlists = await this.embyAdapter.getPlaylists('');
    const matchingPlaylists: string[] = [];

    // Build set of IDs to match against playlist contents
    const targetIds = new Set<string>();

    if (type === 'show' || type === 'season') {
      // For shows/seasons: collect all episode IDs
      const seasons =
        type === 'season'
          ? [{ id: itemId }]
          : await this.embyAdapter.getChildrenMetadata(itemId, 'season');

      for (const season of seasons) {
        const episodes = await this.embyAdapter.getChildrenMetadata(
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
      const items = await this.embyAdapter.getPlaylistItems(playlist.id);
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
    ruleGroup?: RuleGroupDto,
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
    ruleGroup?: RuleGroupDto,
  ): Promise<string[]> {
    const collections = await this.embyAdapter.getCollections(libraryId);
    const collectionNames: string[] = [];

    const idsToCheck = [itemId, parentId, grandparentId].filter(
      (id): id is string => id !== undefined,
    );

    for (const collection of collections) {
      const children = await this.embyAdapter.getCollectionChildren(
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
    ruleGroup?: RuleGroupDto,
  ): Promise<Date | null> {
    const collections = await this.embyAdapter.getCollections(libraryId);
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

      const children = await this.embyAdapter.getCollectionChildren(
        collection.id,
      );
      if (!children.some((child) => child.id === itemId)) {
        continue;
      }

      for (const child of children) {
        // getWatchHistory aggregates LastPlayedDate across all Emby users
        // (unlike child.lastViewedAt which is scoped to the admin user).
        const history = await this.embyAdapter.getWatchHistory(child.id);
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
        : await this.embyAdapter.getChildrenMetadata(itemId, 'season');

    let latestAiredAt: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.embyAdapter.getChildrenMetadata(
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
    const episodes = await this.embyAdapter.getChildrenMetadata(
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
