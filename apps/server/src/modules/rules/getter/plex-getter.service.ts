import { EMediaDataType, RuleValueType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import {
  PlexLibraryItem,
  PlexSeenBy,
  SimplePlexUser,
} from '../../..//modules/api/plex-api/interfaces/library.interfaces';
import { PlexApiService } from '../../../modules/api/plex-api/plex-api.service';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { PlexMapper } from '../../api/media-server/plex/plex.mapper';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { RulesDto } from '../dtos/rules.dto';

@Injectable()
export class PlexGetterService {
  plexProperties: Property[];

  constructor(
    private readonly plexApi: PlexApiService,
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
    libItem: PlexLibraryItem,
    dataType?: EMediaDataType,
    ruleGroup?: RulesDto,
  ): Promise<RuleValueType> {
    try {
      const prop = this.plexProperties.find((el) => el.id === id);

      // fetch metadata, parent & grandparent from cache, this data is more complete
      const metadata: PlexMetadata = await this.plexApi.getMetadata(
        libItem.ratingKey,
      );

      // Parent/grandparent metadata is only needed for some properties.
      // Lazy-load and memoize so we don't fetch unless a case uses it.
      let parentPromise: Promise<PlexMetadata> | undefined;
      const getParent = async (): Promise<PlexMetadata | undefined> => {
        if (!metadata?.parentRatingKey) return undefined;
        parentPromise ??= this.plexApi.getMetadata(metadata.parentRatingKey);
        return parentPromise;
      };

      let grandparentPromise: Promise<PlexMetadata> | undefined;
      const getGrandparent = async (): Promise<PlexMetadata | undefined> => {
        if (!metadata?.grandparentRatingKey) return undefined;
        grandparentPromise ??= this.plexApi.getMetadata(
          metadata.grandparentRatingKey,
        );
        return grandparentPromise;
      };

      switch (prop.name) {
        case 'addDate': {
          return metadata.addedAt ? new Date(+metadata.addedAt * 1000) : null;
        }
        case 'seenBy': {
          const plexUsers = await this.plexApi.getCorrectedUsers(false);

          const viewers: PlexSeenBy[] = await this.plexApi
            .getWatchHistory(metadata.ratingKey)
            .catch(() => {
              return null;
            });
          if (viewers) {
            const viewerIds = viewers.map((el) => +el.accountID);
            return plexUsers
              .filter((el) => viewerIds.includes(el.plexId))
              .map((el) => el.username);
          } else {
            return [];
          }
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
          const count = await this.plexApi.getWatchHistory(metadata.ratingKey);
          return count ? count.length : 0;
        }
        case 'labels': {
          const item =
            metadata.type === 'episode'
              ? (((await getGrandparent()) as unknown as PlexLibraryItem) ??
                metadata)
              : metadata.type === 'season'
                ? (((await getParent()) as unknown as PlexLibraryItem) ??
                  metadata)
                : metadata;

          return item.Label ? item.Label.map((l) => l.tag) : [];
        }
        case 'collections': {
          return metadata.Collection
            ? metadata.Collection.filter(
                (el) =>
                  el.tag.toLowerCase().trim() !==
                  (ruleGroup?.collection?.manualCollection &&
                  ruleGroup?.collection?.manualCollectionName
                    ? ruleGroup.collection.manualCollectionName
                    : ruleGroup.name
                  )
                    .toLowerCase()
                    .trim(),
              ).length
            : 0;
        }
        case 'sw_collections_including_parent': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          const combinedCollections = [
            ...(metadata?.Collection || []),
            ...(parent?.Collection || []),
            ...(grandparent?.Collection || []),
          ];

          return combinedCollections
            ? combinedCollections.filter(
                (el) =>
                  el.tag.toLowerCase().trim() !==
                  (ruleGroup?.collection?.manualCollection &&
                  ruleGroup?.collection?.manualCollectionName
                    ? ruleGroup.collection.manualCollectionName
                    : ruleGroup.name
                  )
                    .toLowerCase()
                    .trim(),
              ).length
            : 0;
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
            return filtered ? filtered.map((el) => el.title.trim()) : [];
          } else {
            const playlists = await this.plexApi.getPlaylists(
              metadata.ratingKey,
            );
            return playlists ? playlists.map((el) => el.title.trim()) : [];
          }
        }
        case 'collection_names': {
          return metadata.Collection
            ? metadata.Collection.map((el) => el.tag.trim())
            : null;
        }
        case 'sw_collection_names_including_parent': {
          const parent = await getParent();
          const grandparent = await getGrandparent();
          const combinedCollections = [
            ...(metadata?.Collection || []),
            ...(parent?.Collection || []),
            ...(grandparent?.Collection || []),
          ];

          return combinedCollections
            ? combinedCollections.map((el) => el.tag.trim())
            : null;
        }
        case 'lastViewedAt': {
          return await this.plexApi
            .getWatchHistory(metadata.ratingKey)
            .then((seenby) => {
              if (seenby.length > 0) {
                return new Date(
                  +seenby
                    .map((el) => el.viewedAt)
                    .sort()
                    .reverse()[0] * 1000,
                );
              } else {
                return null;
              }
            })
            .catch(() => {
              return null;
            });
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
          const item =
            metadata.type === 'episode'
              ? (((await getGrandparent()) as unknown as PlexLibraryItem) ??
                metadata)
              : metadata.type === 'season'
                ? (((await getParent()) as unknown as PlexLibraryItem) ??
                  metadata)
                : metadata;
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
              const viewers: PlexSeenBy[] = await this.plexApi
                .getWatchHistory(episode.ratingKey)
                .catch(() => {
                  return null;
                });

              const arrLength = allViewers.length - 1;
              allViewers
                .slice()
                .reverse()
                .forEach((el, idx) => {
                  if (
                    !viewers ||
                    !viewers.find((viewEl) => el.plexId === viewEl.accountID)
                  ) {
                    allViewers.splice(arrLength - idx, 1);
                  }
                });
            }
          }

          if (allViewers && allViewers.length > 0) {
            const viewerIds = allViewers.map((el) => +el.plexId);
            return plexUsers
              .filter((el) => viewerIds.includes(el.plexId))
              .map((el) => el.username);
          }

          return [];
        }
        case 'sw_watchers': {
          const plexUsers = await this.plexApi.getCorrectedUsers(false);

          const watchHistory = await this.plexApi.getWatchHistory(
            metadata.ratingKey,
          );

          const viewers = watchHistory
            ? watchHistory.map((el) => +el.accountID)
            : [];
          const uniqueViewers = [...new Set(viewers)];

          if (uniqueViewers && uniqueViewers.length > 0) {
            return plexUsers
              .filter((el) => uniqueViewers.includes(+el.plexId))
              .map((el) => el.username);
          }
          return [];
        }
        case 'sw_lastWatched': {
          let watchHistory = await this.plexApi.getWatchHistory(
            metadata.ratingKey,
          );
          watchHistory?.sort((a, b) => a.parentIndex - b.parentIndex).reverse();
          watchHistory = watchHistory?.filter(
            (el) => el.parentIndex === watchHistory[0].parentIndex,
          );
          watchHistory?.sort((a, b) => a.index - b.index).reverse();
          return watchHistory
            ? new Date(+watchHistory[0].viewedAt * 1000)
            : null;
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
              );
              if (views?.length > 0) {
                viewCount++;
              }
            }
          }
          return viewCount;
        }
        case 'sw_amountOfViews': {
          let viewCount = 0;

          // for episodes
          if (metadata.type === 'episode') {
            const views = await this.plexApi.getWatchHistory(
              metadata.ratingKey,
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

          const usernames: string[] = [];
          for (const u of plexUsers.filter(
            (u) => u.uuid !== undefined && media_uuid !== undefined,
          )) {
            const watchlist = await this.plexApi.getWatchlistIdsForUser(
              u.uuid,
              u.username,
            );
            if (watchlist?.find((i) => i.id === media_uuid[1]) !== undefined) {
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

          for (const u of plexUsers.filter(
            (u) => u.uuid !== undefined && media_uuid !== undefined,
          )) {
            const watchlist = await this.plexApi.getWatchlistIdsForUser(
              u.uuid,
              u.username,
            );
            if (watchlist?.find((i) => i.id === media_uuid[1]) !== undefined) {
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

          const normalCollectionCount = metadata.Collection
            ? metadata.Collection.filter(
                (el) =>
                  el.tag.toLowerCase().trim() !==
                  (ruleGroup?.collection?.manualCollection &&
                  ruleGroup?.collection?.manualCollectionName
                    ? ruleGroup.collection.manualCollectionName
                    : ruleGroup.name
                  )
                    .toLowerCase()
                    .trim(),
              ).length
            : 0;

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

            const ratingKeys = [
              metadata.ratingKey,
              parent?.ratingKey,
              grandparent?.ratingKey,
            ].filter((x) => x != null);

            smartCollectionCount += children.filter((x) =>
              ratingKeys.includes(x.ratingKey),
            ).length;
          }

          const normalCollectionCount = combinedCollections
            ? combinedCollections.filter(
                (el) =>
                  el.tag.toLowerCase().trim() !==
                  (ruleGroup?.collection?.manualCollection &&
                  ruleGroup?.collection?.manualCollectionName
                    ? ruleGroup.collection.manualCollectionName
                    : ruleGroup.name
                  )
                    .toLowerCase()
                    .trim(),
              ).length
            : 0;

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

            const ratingKeys = [
              metadata.ratingKey,
              parent?.ratingKey,
              grandparent?.ratingKey,
            ].filter((x) => x != null);

            if (children.some((x) => ratingKeys.includes(x.ratingKey))) {
              smartCollectionNames.push(smartCollection.title);
            }
          }

          const combinedCollections = new Set([
            ...(metadata.Collection?.map((x) => x.tag) || []),
            ...(parent?.Collection?.map((x) => x.tag) || []),
            ...(grandparent?.Collection?.map((x) => x.tag) || []),
            ...smartCollectionNames,
          ]);

          return Array.from(combinedCollections).map((el) => el.trim());
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

          const combinedCollections = new Set([
            ...(metadata.Collection?.map((x) => x.tag) || []),
            ...smartCollectionNames,
          ]);

          return Array.from(combinedCollections).map((el) => el.trim());
        }
        default: {
          return null;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Plex-Getter - Action failed for '${libItem.title}' with id '${libItem.ratingKey}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }
}
