import {
  MediaItem,
  MediaItemType,
  MediaUser,
  RequestMediaStatus,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import {
  OverseerrApiService,
  OverSeerrMovieResponse,
  OverseerrSeasonRequest,
  OverSeerrSeasonResponse,
  OverseerrTVRequest,
  OverSeerrTVResponse,
} from '../../api/overseerr-api/overseerr-api.service';
import { TmdbIdService } from '../../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';

@Injectable()
export class OverseerrGetterService {
  appProperties: Property[];

  constructor(
    private readonly overseerrApi: OverseerrApiService,
    private readonly tmdbApi: TmdbApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly tmdbIdHelper: TmdbIdService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(OverseerrGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.appProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.OVERSEERR,
    ).props;
  }

  private async getMediaServer(): Promise<IMediaServerService> {
    return this.mediaServerFactory.getService();
  }

  async get(id: number, libItem: MediaItem, dataType?: MediaItemType) {
    try {
      let origLibItem: MediaItem = undefined;
      let seasonMediaResponse: OverSeerrSeasonResponse = undefined;
      let tvMediaResponse: OverSeerrTVResponse = undefined;
      let movieMediaResponse: OverSeerrMovieResponse = undefined;

      // get original show in case of season / episode
      if (dataType === 'season' || dataType === 'episode') {
        origLibItem = _.cloneDeep(libItem);
        const mediaServer = await this.getMediaServer();
        libItem = await mediaServer.getMetadata(
          dataType === 'season' ? libItem.parentId : libItem.grandparentId,
        );
      }

      const prop = this.appProperties.find((el) => el.id === id);
      const tmdb = await this.tmdbIdHelper.getTmdbIdFromMediaItem(libItem);
      // const overseerrUsers = await this.overseerrApi.getUsers();

      if (tmdb && tmdb.id) {
        if (libItem.type === 'movie') {
          movieMediaResponse = await this.overseerrApi.getMovie(
            tmdb.id.toString(),
          );
        } else {
          tvMediaResponse = await this.overseerrApi.getShow(tmdb.id.toString());
          if (dataType === 'season' || dataType === 'episode') {
            const seasonNumber =
              dataType === 'season'
                ? origLibItem.index
                : origLibItem.parentIndex;
            seasonMediaResponse = await this.overseerrApi.getSeason(
              tmdb.id.toString(),
              seasonNumber?.toString(),
            );
            if (!seasonMediaResponse) {
              this.logger.debug(
                `Couldn't fetch season data for '${libItem.title}' season ${seasonNumber} from Overseerr. As a result, unreliable results are expected.`,
              );
            }
          }
        }
      } else {
        this.logger.debug(
          `Couldn't find tmdb id for media '${libItem.title}' with id '${libItem.id}'. As a result, no Overseerr query could be made.`,
        );
      }

      const mediaResponse: OverSeerrTVResponse | OverSeerrMovieResponse =
        tvMediaResponse ?? movieMediaResponse;

      if (mediaResponse?.mediaInfo) {
        switch (prop.name) {
          case 'addUser': {
            try {
              const userNames: string[] = [];
              if (mediaResponse.mediaInfo.requests) {
                // Only fetch media server users if we need them (for Plex user lookup)
                let mediaServerUsers: MediaUser[] | null = null;

                for (const request of mediaResponse.mediaInfo.requests) {
                  // for seasons, only add if user requested the correct season
                  if (
                    (dataType === 'season' || dataType === 'episode') &&
                    request.type === 'tv'
                  ) {
                    const includesSeason = this.includesSeason(
                      request.seasons,
                      dataType === 'season'
                        ? origLibItem.index
                        : origLibItem.parentIndex,
                    );
                    if (includesSeason) {
                      const username = await this.resolveRequestUsername(
                        request,
                        mediaServerUsers,
                        async () => {
                          if (!mediaServerUsers) {
                            const mediaServer = await this.getMediaServer();
                            mediaServerUsers = await mediaServer.getUsers();
                          }
                          return mediaServerUsers;
                        },
                      );
                      if (username) {
                        userNames.push(username);
                      }
                    }
                  } else {
                    // for shows and movies, add every request user
                    const username = await this.resolveRequestUsername(
                      request,
                      mediaServerUsers,
                      async () => {
                        if (!mediaServerUsers) {
                          const mediaServer = await this.getMediaServer();
                          mediaServerUsers = await mediaServer.getUsers();
                        }
                        return mediaServerUsers;
                      },
                    );
                    if (username) {
                      userNames.push(username);
                    }
                  }
                }
                return [...new Set(userNames)]; // return only unique usernames
              }
              return [];
            } catch (e) {
              this.logger.warn("Couldn't get addUser from Overseerr");
              this.logger.debug(e);
            }
          }
          case 'amountRequested': {
            return dataType === 'season' || dataType === 'episode'
              ? this.getSeasonRequests(origLibItem, tvMediaResponse).length
              : mediaResponse?.mediaInfo.requests.length;
          }
          case 'requestDate': {
            if (dataType === 'season' || dataType === 'episode') {
              const createdAt = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0]?.createdAt;

              return createdAt ? new Date(createdAt) : null;
            }
            return mediaResponse?.mediaInfo?.requests[0]?.createdAt
              ? new Date(mediaResponse?.mediaInfo?.requests[0]?.createdAt)
              : null;
          }
          case 'releaseDate': {
            if (libItem.type === 'movie') {
              return movieMediaResponse?.releaseDate
                ? new Date(movieMediaResponse?.releaseDate)
                : null;
            } else {
              if (dataType === 'episode') {
                const ep = seasonMediaResponse.episodes?.find(
                  (el) => el.episodeNumber === origLibItem.index,
                );
                return ep?.airDate ? new Date(ep.airDate) : null;
              } else if (dataType === 'season') {
                return seasonMediaResponse?.airDate
                  ? new Date(seasonMediaResponse.airDate)
                  : null;
              } else {
                return tvMediaResponse?.firstAirDate
                  ? new Date(tvMediaResponse.firstAirDate)
                  : null;
              }
            }
          }
          case 'approvalDate': {
            if (dataType === 'season' || dataType === 'episode') {
              const season = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0];
              if (season && season.media) {
                if (
                  season.media.status >= RequestMediaStatus.PARTIALLY_AVAILABLE
                ) {
                  return new Date(season.media.updatedAt);
                }
              }
              return null;
            } else {
              return mediaResponse?.mediaInfo.status >=
                RequestMediaStatus.PARTIALLY_AVAILABLE
                ? new Date(mediaResponse?.mediaInfo?.updatedAt)
                : null;
            }
          }
          case 'mediaAddedAt': {
            if (dataType === 'season' || dataType === 'episode') {
              const season = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0];
              if (season && season.media) {
                if (
                  season.media.status >= RequestMediaStatus.PARTIALLY_AVAILABLE
                ) {
                  return new Date(season.media.mediaAddedAt);
                }
              }
              return null;
            } else {
              return mediaResponse?.mediaInfo.status >=
                RequestMediaStatus.PARTIALLY_AVAILABLE
                ? new Date(mediaResponse?.mediaInfo?.mediaAddedAt)
                : null;
            }
          }
          case 'isRequested': {
            try {
              if (dataType === 'season' || dataType === 'episode') {
                return this.getSeasonRequests(origLibItem, tvMediaResponse)
                  .length > 0
                  ? 1
                  : 0;
              } else {
                return mediaResponse?.mediaInfo.requests.length > 0 ? 1 : 0;
              }
            } catch (e) {
              return 0;
            }
          }
          default: {
            return null;
          }
        }
      } else {
        this.logger.debug(
          `Couldn't fetch Overseerr metadate for media '${libItem.title}' with id '${libItem.id}'. As a result, no Overseerr query could be made.`,
        );
        return null;
      }
    } catch (e) {
      this.logger.warn(
        `Overseerr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  private getSeasonRequests(
    libItem: MediaItem,
    mediaResponse: OverSeerrTVResponse,
  ) {
    const seasonRequests: OverseerrTVRequest[] = [];
    mediaResponse.mediaInfo?.requests.forEach((el) => {
      const season = el.seasons.find(
        (season) =>
          +season.seasonNumber ===
          (libItem.type === 'episode' ? +libItem.parentIndex : +libItem.index),
      );
      if (season) {
        seasonRequests.push(el);
      }
    });
    return seasonRequests;
  }

  private includesSeason(
    seasons: OverseerrSeasonRequest[],
    seasonNumber: number,
  ) {
    const season = seasons.find(
      (season) => season.seasonNumber === seasonNumber,
    );
    return season !== undefined;
  }

  /**
   * Resolves the username from an Overseerr request.
   * Handles different user types:
   * - userType 2: Local user - uses username directly
   * - userType 1 (or other): Plex user - looks up in media server users by ID
   */
  private async resolveRequestUsername(
    request: {
      requestedBy?: { userType?: number; username?: string; plexId?: number };
    },
    cachedUsers: MediaUser[] | null,
    fetchUsers: () => Promise<MediaUser[]>,
  ): Promise<string | undefined> {
    const requestedBy = request.requestedBy;
    if (!requestedBy) return undefined;

    // Local user - use username directly
    if (requestedBy.userType === 2) {
      return requestedBy.username;
    }

    // Plex user - look up in media server users
    if (requestedBy.plexId) {
      const users = cachedUsers ?? (await fetchUsers());
      const user = users.find((u) => u.id === String(requestedBy.plexId));
      return user?.name;
    }

    return undefined;
  }
}
