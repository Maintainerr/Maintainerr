import {
  isMediaType,
  MediaItem,
  MediaItemType,
  RuleValueType,
  WatchRecord,
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
import { RuleGroupDto } from '../dtos/ruleGroup.dto';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';
import {
  filterRuleCollectionNames,
  mapRuleUserIdsToNames,
} from '../helpers/rule-property.helper';
import { MetadataRuleValueService } from './metadata-rule-value.service';

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
    private readonly metadataRuleValueService: MetadataRuleValueService,
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
    ruleGroup?: RuleGroupDto,
    arrLookupCache?: ArrLookupCache,
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

      if (prop.name === 'studios') {
        return await this.metadataRuleValueService.getStudios(
          libItem,
          arrLookupCache,
        );
      }

      // Which library's prefetched watch snapshot may answer the reads below.
      // Absent (a single-item rule test) simply means every read goes live.
      const libraryId = ruleGroup?.libraryId;

      // Fetch full metadata from Jellyfin
      // Note: libItem.id maps to Jellyfin item ID
      const metadata = await this.jellyfinAdapter.getMetadata(libItem.id);

      if (!metadata) {
        this.logger.warn(
          `Failed to get Jellyfin metadata for item ${libItem.id}`,
        );
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
            libraryId,
          );
          const users = await this.jellyfinAdapter.getUsers();
          return mapRuleUserIdsToNames(
            seenByUserIds,
            users,
            (user) => user.id,
            (user) => user.name,
          );
        }

        case 'favoritedBy': {
          const favoritedByUserIds =
            await this.jellyfinAdapter.getItemFavoritedBy(
              metadata.id,
              libraryId,
            );
          const users = await this.jellyfinAdapter.getUsers();
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
          const watchState = await this.jellyfinAdapter.getWatchState(
            metadata.id,
          );
          return watchState.viewCount;
        }

        case 'isWatched': {
          const watchState = await this.jellyfinAdapter.getWatchState(
            metadata.id,
          );
          return watchState.isWatched;
        }

        case 'playCount': {
          // Get total play attempts across all users (includes unfinished views)
          return await this.jellyfinAdapter.getTotalPlayCount(
            metadata.id,
            libraryId,
          );
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
              libraryId,
            );
          }
          return await this.getLastViewedAt(metadata.id, libraryId);
        }

        case 'lastPlayedAt': {
          // Get newest play attempt across all users (includes unfinished views)
          return await this.getLastPlayedAt(
            metadata.id,
            metadata.type,
            libraryId,
          );
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
          if (isMediaType(metadata.type, 'episode')) {
            const grandparent = await getGrandparent();
            return grandparent?.genres?.map((genre) => genre.name) ?? [];
          }
          if (isMediaType(metadata.type, 'season')) {
            const parent = await getParent();
            return parent?.genres?.map((genre) => genre.name) ?? [];
          }
          return metadata.genres?.map((genre) => genre.name) ?? [];
        }

        case 'sw_allEpisodesSeenBy': {
          return await this.getAllEpisodesSeenBy(
            metadata.id,
            metadata.type,
            libraryId,
          );
        }

        case 'sw_lastWatched': {
          return await this.getNewestWatchedEpisodeDate(
            metadata.id,
            metadata.type,
            libraryId,
          );
        }

        case 'sw_lastViewedAtThroughSeason': {
          if (metadata.type !== 'season') {
            return null;
          }

          const targetSeason = metadata.index;
          const showId = metadata.parentId;
          if (
            !Number.isSafeInteger(targetSeason) ||
            targetSeason! < 0 ||
            typeof showId !== 'string' ||
            showId !== showId.trim() ||
            !showId
          ) {
            throw new Error(
              'Jellyfin season metadata is missing its valid scope',
            );
          }

          const watchHistory = await this.descendantWatchHistory(
            showId,
            'show',
            libraryId,
          );
          for (const records of Object.values(watchHistory)) {
            for (const record of records) {
              if (
                record.watchedAt !== undefined &&
                !Number.isFinite(record.watchedAt.getTime())
              ) {
                throw new Error('Jellyfin returned an invalid watch date');
              }
            }
          }

          const seasons = await this.jellyfinAdapter.getChildrenMetadata(
            showId,
            'season',
            true,
          );
          let latestWatchedAtMs: number | undefined;

          for (const season of seasons) {
            if (!Number.isSafeInteger(season.index) || season.index! < 0) {
              throw new Error('Jellyfin returned an invalid season index');
            }

            const qualifies =
              targetSeason === 0
                ? season.index === 0
                : season.index! > 0 && season.index! <= targetSeason!;
            if (!qualifies) continue;

            const episodes = await this.jellyfinAdapter.getChildrenMetadata(
              season.id,
              'episode',
              true,
            );
            for (const episode of episodes) {
              for (const record of watchHistory[episode.id] ?? []) {
                if (record.watchedAt === undefined) continue;
                const watchedAtMs = record.watchedAt.getTime();
                if (
                  latestWatchedAtMs === undefined ||
                  watchedAtMs > latestWatchedAtMs
                ) {
                  latestWatchedAtMs = watchedAtMs;
                }
              }
            }
          }

          return latestWatchedAtMs === undefined
            ? null
            : new Date(latestWatchedAtMs);
        }

        case 'sw_episodes': {
          return await this.getEpisodeCount(metadata.id, metadata.type);
        }

        case 'sw_viewedEpisodes': {
          return await this.getViewedEpisodeCount(
            metadata.id,
            metadata.type,
            libraryId,
          );
        }

        case 'sw_lastEpisodeAddedAt': {
          return await this.getLastEpisodeAddedAt(metadata.id, metadata.type);
        }

        case 'sw_amountOfViews': {
          return await this.getTotalShowViews(
            metadata.id,
            metadata.type,
            libraryId,
          );
        }

        case 'sw_playCount': {
          // For episodes, get total play attempts (includes unfinished views)
          return await this.jellyfinAdapter.getTotalPlayCount(
            metadata.id,
            libraryId,
          );
        }

        case 'sw_favoritedBy': {
          const favoritedByUserIds =
            await this.jellyfinAdapter.getItemFavoritedBy(
              metadata.id,
              libraryId,
            );
          const users = await this.jellyfinAdapter.getUsers();
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
            libraryId,
          );
          const users = await this.jellyfinAdapter.getUsers();
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
        case 'sw_watchers': {
          return await this.getSwWatchers(
            metadata.id,
            metadata.type,
            libraryId,
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

        // Plex-only features - not supported in Jellyfin
        case 'watchlist_isListedByUsers':
        case 'watchlist_isWatchlisted': {
          return prop.name === 'watchlist_isWatchlisted' ? false : [];
        }

        // Rating properties - Jellyfin provides CommunityRating and CriticRating.
        // CommunityRating is provider-dependent and is not guaranteed to be IMDb-specific.
        // CriticRating is typically from Rotten Tomatoes (0-100 scale, stored as 0-10 after mapping).
        case 'rating_imdb':
        case 'rating_tmdb': {
          // Both rules fall back to Jellyfin CommunityRating because the API does not
          // expose a dedicated IMDb numeric rating field in the published SDK/OpenAPI model.
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
          // Jellyfin doesn't provide RT audience ratings separately
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

        case 'collection_siblings_lastViewedAt': {
          // Aggregate "last view date" across every movie that shares a Jellyfin
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
          this.logger.warn(`Unhandled Jellyfin property: ${prop.name}`);
          return null;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Jellyfin-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  /**
   * Jellyfin resolves a parentId that is not a container by falling back to the
   * whole library, so an episode or movie id would silently answer for every
   * episode on the server. Only a show or a season may be swept; anything else
   * has no episode descendants and answers empty, as the per-episode walk did.
   */
  private async descendantWatchHistory(
    itemId: string,
    type: MediaItemType,
    libraryId: string | undefined,
  ): Promise<Record<string, WatchRecord[]>> {
    if (!isMediaType(type, 'show') && !isMediaType(type, 'season')) {
      return {};
    }

    return this.jellyfinAdapter.getDescendantEpisodeWatchHistory(
      itemId,
      libraryId,
    );
  }

  private newestWatchedAt(records: WatchRecord[]): Date | null {
    const times = records
      .map((r) => r.watchedAt)
      .filter((d): d is Date => d !== undefined)
      .map((d) => d.getTime());

    return times.length > 0 ? new Date(Math.max(...times)) : null;
  }

  private async getLastViewedAt(
    itemId: string,
    libraryId: string | undefined,
  ): Promise<Date | null> {
    return this.newestWatchedAt(
      await this.jellyfinAdapter.getWatchHistory(itemId, true, libraryId),
    );
  }

  /**
   * Jellyfin resolves a parentId that is not a container by falling back to the
   * whole library, so only a show or a season may be walked; anything else is
   * read directly. Series and seasons carry no LastPlayedDate of their own,
   * hence the walk. `libraryId` lets each episode read come from the
   * prefetched snapshot rather than a per-user fan-out.
   */
  private async getLastPlayedAt(
    itemId: string,
    type: MediaItemType,
    libraryId: string | undefined,
  ): Promise<Date | null> {
    if (!isMediaType(type, 'show') && !isMediaType(type, 'season')) {
      return this.jellyfinAdapter.getLastPlayedAt(itemId, libraryId);
    }

    const seasons =
      type === 'season'
        ? [{ id: itemId }]
        : await this.jellyfinAdapter.getChildrenMetadata(
            itemId,
            'season',
            true,
          );
    let latestDate: Date | null = null;

    for (const season of seasons) {
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
        season.id,
        'episode',
        true,
      );
      for (const episode of episodes) {
        const lastPlayedAt = await this.jellyfinAdapter.getLastPlayedAt(
          episode.id,
          libraryId,
        );
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
    libraryId: string | undefined,
  ): Promise<string[]> {
    const users = await this.jellyfinAdapter.getUsers();
    const episodeWatchers = Object.values(
      await this.descendantWatchHistory(itemId, type, libraryId),
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

  /**
   * Return the view date of the highest-numbered episode that has been
   * watched within the highest-numbered season that has any watches, or
   * null when nothing has been watched. Matches the Plex/Tautulli
   * `sw_lastWatched` semantic: "view date of the newest watched episode".
   */
  private async getNewestWatchedEpisodeDate(
    itemId: string,
    type: MediaItemType,
    libraryId: string | undefined,
  ): Promise<Date | null> {
    const seasons: Array<{ id: string }> =
      type === 'season'
        ? [{ id: itemId }]
        : await this.jellyfinAdapter.getChildrenMetadata(itemId, 'season');

    const watched: Array<{
      parentIndex: number;
      index: number;
      viewedAt: Date;
    }> = [];

    const watchHistory = await this.descendantWatchHistory(
      itemId,
      type,
      libraryId,
    );

    for (const season of seasons) {
      const episodes = await this.jellyfinAdapter.getChildrenMetadata(
        season.id,
        'episode',
      );
      for (const episode of episodes) {
        const episodeOrder = episode.indexEnd ?? episode.index;

        if (episodeOrder === undefined || episode.parentIndex === undefined) {
          continue;
        }
        const viewedAt = this.newestWatchedAt(watchHistory[episode.id] ?? []);
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
   * show or season, or null when nothing has been watched. Jellyfin does not
   * expose a watched timestamp on the parent item, so the only way to derive
   * a "last watched" signal for shows/seasons is to walk the children and
   * take the max. This is an aggregate - it is not the view date of the
   * highest-numbered episode, the way the Plex/Tautulli `sw_lastWatched`
   * getters compute it. Used by the `lastViewedAt` rule only.
   */
  private async getLastWatchedShowDate(
    itemId: string,
    type: MediaItemType,
    libraryId: string | undefined,
  ): Promise<Date | null> {
    const watchHistory = await this.descendantWatchHistory(
      itemId,
      type,
      libraryId,
    );

    return this.newestWatchedAt(Object.values(watchHistory).flat());
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
    libraryId: string | undefined,
  ): Promise<number> {
    const watchHistory = await this.descendantWatchHistory(
      itemId,
      type,
      libraryId,
    );

    return Object.values(watchHistory).filter((records) => records.length > 0)
      .length;
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
    libraryId: string | undefined,
  ): Promise<number> {
    if (type === 'episode') {
      const history = await this.jellyfinAdapter.getWatchHistory(
        itemId,
        true,
        libraryId,
      );
      return history.length;
    }

    const watchHistory = await this.descendantWatchHistory(
      itemId,
      type,
      libraryId,
    );

    return Object.values(watchHistory).reduce(
      (total, records) => total + records.length,
      0,
    );
  }

  private async getSwWatchers(
    itemId: string,
    type: MediaItemType,
    libraryId: string | undefined,
  ): Promise<string[]> {
    const users = await this.jellyfinAdapter.getUsers();
    let watcherIds: string[];

    switch (type) {
      case 'episode': {
        watcherIds = await this.jellyfinAdapter.getItemSeenBy(
          itemId,
          libraryId,
        );
        break;
      }

      // Union of everyone who watched ANY episode - not the intersection
      // (#2559). sw_allEpisodesSeenBy is the "watched every episode" one.
      case 'season':
      case 'show': {
        const watchHistory = await this.descendantWatchHistory(
          itemId,
          type,
          libraryId,
        );
        const watched = new Set(
          Object.values(watchHistory).flatMap((records) =>
            records.map((record) => record.userId),
          ),
        );
        // Ordered by user, not by episode, so the list reads the same as the
        // per-episode walk it replaces. Watchers with no user record (a
        // deleted account) sort last rather than being dropped.
        const order = new Map(users.map((user, index) => [user.id, index]));
        watcherIds = [...watched].sort(
          (a, b) =>
            (order.get(a) ?? users.length) - (order.get(b) ?? users.length),
        );
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

    return filterRuleCollectionNames(allCollectionNames, ruleGroup);
  }

  private async getFavoritedByIncludingParent(
    itemId: string,
    parentId: string | undefined,
    grandparentId: string | undefined,
    libraryId: string | undefined,
  ): Promise<string[]> {
    const idsToCheck = [...new Set([itemId, parentId, grandparentId])].filter(
      (id): id is string => id !== undefined,
    );

    const favoritedByUserIds = new Set<string>();
    for (const id of idsToCheck) {
      const users = await this.jellyfinAdapter.getItemFavoritedBy(
        id,
        libraryId,
      );
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
    const collections = await this.jellyfinAdapter.getCollections(libraryId);
    const collectionNames: string[] = [];

    const idsToCheck = [itemId, parentId, grandparentId].filter(
      (id): id is string => id !== undefined,
    );

    for (const collection of collections) {
      const children = await this.jellyfinAdapter.getCollectionChildren(
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
    const collections = await this.jellyfinAdapter.getCollections(libraryId);
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

      const children = await this.jellyfinAdapter.getCollectionChildren(
        collection.id,
      );
      if (!children.some((child) => child.id === itemId)) {
        continue;
      }

      for (const child of children) {
        // getWatchHistory aggregates LastPlayedDate across all Jellyfin users
        // (unlike child.lastViewedAt which is scoped to the admin user).
        const history = await this.jellyfinAdapter.getWatchHistory(
          child.id,
          true,
          libraryId,
        );
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
