import {
  MediaItem,
  MediaItemType,
  RuleValueType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { SimplePlexUser } from '../../..//modules/api/plex-api/interfaces/library.interfaces';
import { PlexApiService } from '../../../modules/api/plex-api/plex-api.service';
import { PlexAdapterService } from '../../api/media-server/plex/plex-adapter.service';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';
import {
  countRuleCollectionNames,
  definedUniqueValues,
  filterRuleCollectionNames,
  getParentBackedRuleItem,
  mapMatchingRuleUsersToNames,
  trimRulePropertyNames,
  uniqueTrimmedRulePropertyNames,
} from '../helpers/rule-property.helper';

@Injectable()
export class PlexGetterService {
  plexProperties: Property[];
  private readonly metadataRequestOptions = { includeExternalMedia: true };

  constructor(
    private readonly plexApi: PlexApiService,
    private readonly plexAdapter: PlexAdapterService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(PlexGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.plexProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.PLEX,
    ).props;
  }

  async get(
    id: number,
    libItem: MediaItem,
    dataType?: MediaItemType,
    ruleGroup?: RulesDto,
  ): Promise<RuleValueType> {
    try {
      const prop = this.plexProperties.find((el) => el.id === id);

      // fetch metadata, parent & grandparent from cache, this data is more complete
      // libItem.id maps to Plex's ratingKey
      const metadata: PlexMetadata = await this.plexApi.getMetadata(
        libItem.id,
        this.metadataRequestOptions,
      );

      // Parent/grandparent metadata is only needed for some properties.
      // Lazy-load and memoize so we don't fetch unless a case uses it.
      let parentPromise: Promise<PlexMetadata> | undefined;
      const getParent = async (): Promise<PlexMetadata | undefined> => {
        if (!metadata?.parentRatingKey) return undefined;
        parentPromise ??= this.plexApi.getMetadata(
          metadata.parentRatingKey,
          this.metadataRequestOptions,
        );
        return parentPromise;
      };

      let grandparentPromise: Promise<PlexMetadata> | undefined;
      const getGrandparent = async (): Promise<PlexMetadata | undefined> => {
        if (!metadata?.grandparentRatingKey) return undefined;
        grandparentPromise ??= this.plexApi.getMetadata(
          metadata.grandparentRatingKey,
          this.metadataRequestOptions,
        );
        return grandparentPromise;
      };

      switch (prop.name) {
        case 'addDate': {
          return metadata.addedAt ? new Date(+metadata.addedAt * 1000) : null;
        }
        case 'seenBy': {
          // Errors must surface so the outer catch returns `undefined` for an
          // unknown viewer set instead of collapsing the failure into a
          // confirmed empty `[]`. Same contract as `lastViewedAt` (id 7).
          const plexUsers = await this.plexApi.getCorrectedUsers(false);
          const viewers = await this.plexApi.getWatchHistory(
            metadata.ratingKey,
            true,
            metadata.type,
          );
          const viewerIds = viewers.map((el) => +el.accountID);
          return mapMatchingRuleUsersToNames(
            viewerIds,
            plexUsers,
            (user) => user.plexId,
            (user) => user.username,
          );
        }
        case 'releaseDate': {
          return new Date(metadata.originallyAvailableAt)
            ? new Date(metadata.originallyAvailableAt)
            : null;
        }
        case 'rating_critics': {
          return metadata.rating ? +metadata.rating : 0;
        }
        case 'rating_audience': {
          return metadata.audienceRating ? +metadata.audienceRating : 0;
        }
        case 'rating_user': {
          return metadata.userRating ? +metadata.userRating : 0;
        }
        case 'people': {
          return metadata.Role ? metadata.Role.map((el) => el.tag) : null;
        }
        case 'viewCount': {
          const watchState = await this.plexAdapter.getWatchState(
            metadata.ratingKey,
            libItem.viewCount,
            libItem.title,
            metadata.type,
          );
          return watchState.viewCount;
        }
        case 'isWatched': {
          const watchState = await this.plexAdapter.getWatchState(
            metadata.ratingKey,
            libItem.viewCount,
            libItem.title,
            metadata.type,
          );
          return watchState.isWatched;
        }
        case 'labels': {
          const item = await getParentBackedRuleItem(
            metadata.type,
            metadata,
            getParent,
            getGrandparent,
          );

          return item.Label ? item.Label.map((l) => l.tag) : [];
        }
        case 'collections': {
          return countRuleCollectionNames(
            metadata.Collection?.map((collection) => collection.tag) ?? [],
            ruleGroup,
          );
        }
        case 'sw_collections_including_parent': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          return countRuleCollectionNames(
            [
              ...(metadata.Collection?.map((collection) => collection.tag) ??
                []),
              ...(parent?.Collection?.map((collection) => collection.tag) ??
                []),
              ...(grandparent?.Collection?.map(
                (collection) => collection.tag,
              ) ?? []),
            ],
            ruleGroup,
          );
        }
        case 'playlists': {
          if (metadata.type !== 'episode' && metadata.type !== 'movie') {
            const filtered = [];

            const seasons =
              metadata.type !== 'season'
                ? await this.plexApi.getChildrenMetadata(metadata.ratingKey)
                : [metadata];
            for (const season of seasons) {
              const episodes = await this.plexApi.getChildrenMetadata(
                season.ratingKey,
              );
              for (const episode of episodes) {
                const playlists = await this.plexApi.getPlaylists(
                  episode.ratingKey,
                );

                // add if it doesn't exist yet
                playlists.forEach((el) => {
                  if (!filtered.find((fil) => fil.ratingKey === el.ratingKey)) {
                    filtered.push(el);
                  }
                });
              }
            }
            return filtered.length;
          } else {
            const playlists = await this.plexApi.getPlaylists(
              metadata.ratingKey,
            );
            return playlists.length;
          }
        }
        case 'playlist_names': {
          if (metadata.type !== 'episode' && metadata.type !== 'movie') {
            const filtered = [];

            const seasons =
              metadata.type !== 'season'
                ? await this.plexApi.getChildrenMetadata(metadata.ratingKey)
                : [metadata];
            for (const season of seasons) {
              const episodes = await this.plexApi.getChildrenMetadata(
                season.ratingKey,
              );
              for (const episode of episodes) {
                const playlists = await this.plexApi.getPlaylists(
                  episode.ratingKey,
                );

                // add if it doesn't exist yet
                playlists?.forEach((el) => {
                  if (!filtered.find((fil) => fil.ratingKey === el.ratingKey)) {
                    filtered.push(el);
                  }
                });
              }
            }
            return trimRulePropertyNames(filtered.map((el) => el.title));
          } else {
            const playlists = await this.plexApi.getPlaylists(
              metadata.ratingKey,
            );
            return trimRulePropertyNames(
              playlists ? playlists.map((el) => el.title) : [],
            );
          }
        }
        case 'collection_names': {
          return trimRulePropertyNames(
            metadata.Collection?.map((collection) => collection.tag) ?? [],
          );
        }
        case 'sw_collection_names_including_parent': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          return trimRulePropertyNames([
            ...(metadata.Collection?.map((collection) => collection.tag) ?? []),
            ...(parent?.Collection?.map((collection) => collection.tag) ?? []),
            ...(grandparent?.Collection?.map((collection) => collection.tag) ??
              []),
          ]);
        }
        case 'lastViewedAt': {
          // Errors must surface so the outer catch returns `undefined` for an
          // unknown watch state instead of collapsing the failure into a
          // confirmed never-watched `null`.
          const seenby = await this.plexApi.getWatchHistory(
            metadata.ratingKey,
            true,
            metadata.type,
          );
          if (seenby && seenby.length > 0) {
            return new Date(
              +seenby
                .map((el) => el.viewedAt)
                .sort()
                .reverse()[0] * 1000,
            );
          }
          return null;
        }
        case 'fileVideoResolution': {
          return metadata.Media[0].videoResolution
            ? metadata.Media[0].videoResolution
            : null;
        }
        case 'fileBitrate': {
          return metadata.Media[0].bitrate ? metadata.Media[0].bitrate : 0;
        }
        case 'fileVideoCodec': {
          return metadata.Media[0].videoCodec
            ? metadata.Media[0].videoCodec
            : null;
        }
        case 'genre': {
          const item = await getParentBackedRuleItem(
            metadata.type,
            metadata,
            getParent,
            getGrandparent,
          );
          return item.Genre ? item.Genre.map((el) => el.tag) : null;
        }
        case 'sw_allEpisodesSeenBy': {
          const plexUsers = await this.plexApi.getCorrectedUsers(false);

          const seasons =
            metadata.type !== 'season'
              ? await this.plexApi.getChildrenMetadata(metadata.ratingKey)
              : [metadata];
          const allViewers = plexUsers.slice();
          for (const season of seasons) {
            const episodes = await this.plexApi.getChildrenMetadata(
              season.ratingKey,
            );
            for (const episode of episodes) {
              // Errors propagate to the outer catch - silently treating a
              // failed lookup as "no viewers" would drop genuine viewers from
              // `allViewers` and mark the show as unwatched-by-everyone.
              const viewers = await this.plexApi.getWatchHistory(
                episode.ratingKey,
                true,
                'episode',
              );

              const arrLength = allViewers.length - 1;
              allViewers
                .slice()
                .reverse()
                .forEach((el, idx) => {
                  if (
                    !viewers.find((viewEl) => el.plexId === viewEl.accountID)
                  ) {
                    allViewers.splice(arrLength - idx, 1);
                  }
                });
            }
          }

          if (allViewers && allViewers.length > 0) {
            const viewerIds = allViewers.map((el) => +el.plexId);
            return mapMatchingRuleUsersToNames(
              viewerIds,
              plexUsers,
              (user) => user.plexId,
              (user) => user.username,
            );
          }

          return [];
        }
        // At season/show level this returns the UNION of users that watched
        // any descendant episode - not the intersection. Plex's per-show
        // watch history aggregates child views, so any account that watched
        // at least one episode appears here. Use `sw_allEpisodesSeenBy` when
        // you need "watched every episode" semantics instead.
        case 'sw_watchers': {
          const plexUsers = await this.plexApi.getCorrectedUsers(false);

          const watchHistory = await this.plexApi.getWatchHistory(
            metadata.ratingKey,
            true,
            metadata.type,
          );

          const viewers = watchHistory
            ? watchHistory.map((el) => +el.accountID)
            : [];
          const uniqueViewers = [...new Set(viewers)];

          if (uniqueViewers && uniqueViewers.length > 0) {
            return mapMatchingRuleUsersToNames(
              uniqueViewers,
              plexUsers,
              (user) => +user.plexId,
              (user) => user.username,
            );
          }
          return [];
        }
        case 'sw_lastWatched': {
          const watchHistory = await this.plexApi.getWatchHistory(
            metadata.ratingKey,
            true,
            metadata.type,
          );
          // getWatchHistory returns [] for a confirmed-empty history (it throws
          // on a real outage). [] is truthy and the sort/filter below index
          // watchHistory[0], so guard up front: "never watched" returns null
          // (confirmed absent) rather than reading viewedAt off undefined (#3083).
          if (!watchHistory.length) {
            return null;
          }
          watchHistory.sort((a, b) => b.parentIndex - a.parentIndex);
          const newestSeason = watchHistory.filter(
            (el) => el.parentIndex === watchHistory[0].parentIndex,
          );
          newestSeason.sort((a, b) => b.index - a.index);
          return new Date(+newestSeason[0].viewedAt * 1000);
        }
        case 'sw_episodes': {
          if (metadata.type === 'season') {
            const eps = await this.plexApi.getChildrenMetadata(
              metadata.ratingKey,
            );
            return eps.length ? eps.length : 0;
          }

          return metadata.leafCount ? +metadata.leafCount : 0;
        }
        case 'sw_viewedEpisodes': {
          let viewCount = 0;
          const seasons =
            metadata.type !== 'season'
              ? await this.plexApi.getChildrenMetadata(metadata.ratingKey)
              : [metadata];
          for (const season of seasons) {
            const episodes = await this.plexApi.getChildrenMetadata(
              season.ratingKey,
            );
            for (const episode of episodes) {
              const views = await this.plexApi.getWatchHistory(
                episode.ratingKey,
                true,
                'episode',
              );
              if (views?.length > 0) {
                viewCount++;
              }
            }
          }
          return viewCount;
        }
        case 'sw_markedWatchedEpisodes': {
          // Uses Plex's watched STATE (viewedLeafCount) instead of play history.
          // Unlike sw_viewedEpisodes (which counts episodes with a play-history
          // entry), this also counts episodes manually marked as watched: Plex
          // updates viewedLeafCount for manual marks but records no play history.
          return metadata.viewedLeafCount ? +metadata.viewedLeafCount : 0;
        }
        case 'sw_amountOfViews': {
          let viewCount = 0;

          // for episodes
          if (metadata.type === 'episode') {
            const views = await this.plexApi.getWatchHistory(
              metadata.ratingKey,
              true,
              metadata.type,
            );
            viewCount =
              views?.length > 0 ? viewCount + views.length : viewCount;
          } else {
            // for seasons & shows
            const seasons =
              metadata.type !== 'season'
                ? await this.plexApi.getChildrenMetadata(metadata.ratingKey)
                : [metadata];
            for (const season of seasons) {
              const episodes = await this.plexApi.getChildrenMetadata(
                season.ratingKey,
              );
              for (const episode of episodes) {
                const views = await this.plexApi.getWatchHistory(
                  episode.ratingKey,
                  true,
                  'episode',
                );
                viewCount =
                  views?.length > 0 ? viewCount + views.length : viewCount;
              }
            }
          }
          return viewCount;
        }
        case 'sw_lastEpisodeAddedAt': {
          const seasons =
            metadata.type !== 'season'
              ? (
                  await this.plexApi.getChildrenMetadata(metadata.ratingKey)
                ).sort((a, b) => a.index - b.index)
              : [metadata];

          const lastEpDate = await this.plexApi
            .getChildrenMetadata(seasons[seasons.length - 1].ratingKey)
            .then((eps) => {
              eps.sort((a, b) => a.index - b.index);
              return eps[eps.length - 1]?.addedAt
                ? +eps[eps.length - 1].addedAt
                : null;
            });

          return new Date(+lastEpDate * 1000);
        }
        case 'sw_lastEpisodeAiredAt': {
          const seasons =
            metadata.type !== 'season'
              ? (
                  await this.plexApi.getChildrenMetadata(metadata.ratingKey)
                ).sort((a, b) => a.index - b.index)
              : [metadata];

          const lastEpDate = await this.plexApi
            .getChildrenMetadata(seasons[seasons.length - 1].ratingKey)
            .then((eps) => {
              eps.sort((a, b) => a.index - b.index);
              return eps[eps.length - 1]?.originallyAvailableAt || null;
            });

          // originallyAvailableAt is usually an ISO 8601 date string, no need to convert from epoch time
          return lastEpDate ? new Date(lastEpDate) : null;
        }
        case 'watchlist_isListedByUsers': {
          // returns a list of users that have this media item, or parent, in their watchlist
          const parent = await getParent();
          const grandparent = await getGrandparent();
          const guid = grandparent
            ? grandparent.guid
            : parent
              ? parent.guid
              : metadata.guid;
          const media_uuid = guid.match(/plex:\/\/[a-z]+\/([a-z0-9]+)$/);

          const plexUsers: SimplePlexUser[] =
            await this.plexApi.getCorrectedUsers();

          // When plex.tv is unreachable, no users will have UUIDs. This is a
          // transient transport failure, so return `undefined` - `null` would
          // read as "confirmed absent" and let the executor remove protected
          // items (#3307).
          if (
            plexUsers.length > 0 &&
            !plexUsers.some((u) => u.uuid !== undefined)
          ) {
            this.logger.warn(
              'Unable to check watchlists: no user UUIDs available (plex.tv may be unreachable)',
            );
            return undefined;
          }

          const usernames: string[] = [];
          for (const u of plexUsers.filter(
            (u) => u.uuid !== undefined && media_uuid !== undefined,
          )) {
            const watchlist = await this.plexApi.getWatchlistIdsForUser(
              u.uuid,
              u.username,
            );
            // A failed fetch would silently understate the list, so surface
            // it as transient instead of a confirmed answer.
            if (watchlist === undefined) {
              return undefined;
            }
            if (watchlist.find((i) => i.id === media_uuid[1]) !== undefined) {
              usernames.push(u.username);
            }
          }

          return usernames;
        }
        case 'watchlist_isWatchlisted': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          const guid = grandparent
            ? grandparent.guid
            : parent
              ? parent.guid
              : metadata.guid;
          const media_uuid = guid.match(/plex:\/\/[a-z]+\/([a-z0-9]+)$/);

          const plexUsers: SimplePlexUser[] =
            await this.plexApi.getCorrectedUsers();

          // When plex.tv is unreachable, no users will have UUIDs. This is a
          // transient transport failure, so return `undefined` - `null` would
          // read as "confirmed absent" and let the executor remove protected
          // items (#3307).
          if (
            plexUsers.length > 0 &&
            !plexUsers.some((u) => u.uuid !== undefined)
          ) {
            this.logger.warn(
              'Unable to check watchlists: no user UUIDs available (plex.tv may be unreachable)',
            );
            return undefined;
          }

          for (const u of plexUsers.filter(
            (u) => u.uuid !== undefined && media_uuid !== undefined,
          )) {
            const watchlist = await this.plexApi.getWatchlistIdsForUser(
              u.uuid,
              u.username,
            );
            // A failed fetch cannot confirm "not watchlisted", so surface it
            // as transient instead of a false negative.
            if (watchlist === undefined) {
              return undefined;
            }
            if (watchlist.find((i) => i.id === media_uuid[1]) !== undefined) {
              return true;
            }
          }

          return false;
        }
        case 'sw_seasonLastEpisodeAiredAt': {
          const parent = await getParent();
          if (!parent) {
            return null;
          }
          const lastEpDate = await this.plexApi
            .getChildrenMetadata(parent.ratingKey)
            .then((eps) => {
              eps.sort((a, b) => a.index - b.index);
              return eps[eps.length - 1]?.originallyAvailableAt || null;
            });

          // originallyAvailableAt is usually an ISO 8601 date string, no need to convert from epoch time
          return lastEpDate ? new Date(lastEpDate) : null;
        }
        case 'rating_imdb': {
          return (
            metadata.Rating?.find(
              (x) => x.image.startsWith('imdb') && x.type == 'audience',
            )?.value ?? null
          );
        }
        case 'rating_rottenTomatoesCritic': {
          return (
            metadata.Rating?.find(
              (x) => x.image.startsWith('rottentomatoes') && x.type == 'critic',
            )?.value ?? null
          );
        }
        case 'rating_rottenTomatoesAudience': {
          return (
            metadata.Rating?.find(
              (x) =>
                x.image.startsWith('rottentomatoes') && x.type == 'audience',
            )?.value ?? null
          );
        }
        case 'rating_tmdb': {
          return (
            metadata.Rating?.find(
              (x) => x.image.startsWith('themoviedb') && x.type == 'audience',
            )?.value ?? null
          );
        }
        case 'rating_imdbShow': {
          const showMetadata =
            metadata.type === 'season'
              ? await getParent()
              : await getGrandparent();

          return (
            showMetadata.Rating?.find(
              (x) => x.image.startsWith('imdb') && x.type == 'audience',
            )?.value ?? null
          );
        }
        case 'rating_rottenTomatoesCriticShow': {
          const showMetadata =
            metadata.type === 'season'
              ? await getParent()
              : await getGrandparent();

          return (
            showMetadata.Rating?.find(
              (x) => x.image.startsWith('rottentomatoes') && x.type == 'critic',
            )?.value ?? null
          );
        }
        case 'rating_rottenTomatoesAudienceShow': {
          const showMetadata =
            metadata.type === 'season'
              ? await getParent()
              : await getGrandparent();

          return (
            showMetadata.Rating?.find(
              (x) =>
                x.image.startsWith('rottentomatoes') && x.type == 'audience',
            )?.value ?? null
          );
        }
        case 'rating_tmdbShow': {
          const showMetadata =
            metadata.type === 'season'
              ? await getParent()
              : await getGrandparent();

          return (
            showMetadata.Rating?.find(
              (x) => x.image.startsWith('themoviedb') && x.type == 'audience',
            )?.value ?? null
          );
        }
        case 'collectionsIncludingSmart': {
          if (
            metadata.type !== 'episode' &&
            metadata.type !== 'movie' &&
            metadata.type !== 'season' &&
            metadata.type !== 'show'
          ) {
            throw new Error(`Unexpected metadata type ${metadata.type}`);
          }

          const collections = await this.plexApi.getCollections(
            ruleGroup.libraryId,
            metadata.type,
          );

          const smartCollections = collections.filter((x) => x.smart);
          let smartCollectionCount = 0;

          for (const smartCollection of smartCollections) {
            const children = await this.plexApi.getCollectionChildren(
              smartCollection.ratingKey,
            );

            if (children.some((x) => x.ratingKey === metadata.ratingKey)) {
              smartCollectionCount++;
            }
          }

          const normalCollectionCount = countRuleCollectionNames(
            metadata.Collection?.map((collection) => collection.tag) ?? [],
            ruleGroup,
          );

          return normalCollectionCount + smartCollectionCount;
        }
        case 'sw_collections_including_parent_and_smart': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          const combinedCollections = [
            ...(metadata.Collection || []),
            ...(parent?.Collection || []),
            ...(grandparent?.Collection || []),
          ];

          const collections = await this.plexApi.getCollections(
            ruleGroup.libraryId,
          );

          const smartCollections = collections.filter((x) => x.smart);
          let smartCollectionCount = 0;

          for (const smartCollection of smartCollections) {
            const children = await this.plexApi.getCollectionChildren(
              smartCollection.ratingKey,
            );

            const ratingKeys = definedUniqueValues([
              metadata.ratingKey,
              parent?.ratingKey,
              grandparent?.ratingKey,
            ]);

            smartCollectionCount += children.filter((x) =>
              ratingKeys.includes(x.ratingKey),
            ).length;
          }

          const normalCollectionCount = countRuleCollectionNames(
            combinedCollections.map((collection) => collection.tag),
            ruleGroup,
          );

          return normalCollectionCount + smartCollectionCount;
        }
        case 'sw_collection_names_including_parent_and_smart': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          const collections = await this.plexApi.getCollections(
            ruleGroup.libraryId,
          );

          const smartCollections = collections.filter((x) => x.smart);
          const smartCollectionNames: string[] = [];

          for (const smartCollection of smartCollections) {
            const children = await this.plexApi.getCollectionChildren(
              smartCollection.ratingKey,
            );

            const ratingKeys = definedUniqueValues([
              metadata.ratingKey,
              parent?.ratingKey,
              grandparent?.ratingKey,
            ]);

            if (children.some((x) => ratingKeys.includes(x.ratingKey))) {
              smartCollectionNames.push(smartCollection.title);
            }
          }

          return uniqueTrimmedRulePropertyNames([
            ...(metadata.Collection?.map((x) => x.tag) || []),
            ...(parent?.Collection?.map((x) => x.tag) || []),
            ...(grandparent?.Collection?.map((x) => x.tag) || []),
            ...smartCollectionNames,
          ]);
        }
        case 'collection_names_including_smart': {
          if (
            metadata.type !== 'episode' &&
            metadata.type !== 'movie' &&
            metadata.type !== 'season' &&
            metadata.type !== 'show'
          ) {
            throw new Error(`Unexpected metadata type ${metadata.type}`);
          }

          const collections = await this.plexApi.getCollections(
            ruleGroup.libraryId,
            metadata.type,
          );

          const smartCollections = collections.filter((x) => x.smart);
          const smartCollectionNames: string[] = [];

          for (const smartCollection of smartCollections) {
            const children = await this.plexApi.getCollectionChildren(
              smartCollection.ratingKey,
            );

            if (children.some((x) => x.ratingKey === metadata.ratingKey)) {
              smartCollectionNames.push(smartCollection.title);
            }
          }

          return uniqueTrimmedRulePropertyNames([
            ...(metadata.Collection?.map((x) => x.tag) || []),
            ...smartCollectionNames,
          ]);
        }
        case 'collection_siblings_lastViewedAt': {
          // Aggregate "last view date" across every movie that shares a Plex
          // collection with this item, so one recently-watched sibling keeps
          // the whole set out of the delete pool.
          //
          // We use getWatchHistory (/status/sessions/history/all) - not the
          // per-child lastViewedAt field - because library metadata is scoped
          // to the calling account (admin-only), while the history endpoint
          // returns every user's entries when called with an admin token.
          // Same pattern as the existing lastViewedAt rule (prop id 7).
          const memberTags = filterRuleCollectionNames(
            metadata.Collection?.map((collection) => collection.tag) ?? [],
            ruleGroup,
          );

          if (memberTags.length === 0 || !ruleGroup?.libraryId) {
            return null;
          }

          const memberTagSet = new Set(memberTags.map((t) => t.toLowerCase()));
          const libraryCollections = await this.plexApi.getCollections(
            ruleGroup.libraryId,
            metadata.type === 'movie' ? 'movie' : undefined,
          );
          const matching = (libraryCollections ?? []).filter((c) =>
            memberTagSet.has(c.title.trim().toLowerCase()),
          );

          let latest = 0;
          for (const coll of matching) {
            const children = await this.plexApi.getCollectionChildren(
              coll.ratingKey,
            );
            for (const child of children ?? []) {
              // Errors propagate to the outer catch so a transient lookup
              // failure doesn't silently understate `latest` and trigger a
              // false delete on a recently-watched sibling collection.
              const history = await this.plexApi.getWatchHistory(
                child.ratingKey,
                true,
                child.type,
              );
              for (const entry of history) {
                if (entry.viewedAt && +entry.viewedAt > latest) {
                  latest = +entry.viewedAt;
                }
              }
            }
          }

          return latest > 0 ? new Date(latest * 1000) : null;
        }
        default: {
          return null;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Plex-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(
        `Plex-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
        error,
      );
      return undefined;
    }
  }
}
