import { EMediaDataType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import {
  OverseerrApiService,
  OverseerrMediaStatus,
  OverSeerrMovieResponse,
  OverseerrSeasonRequest,
  OverSeerrSeasonResponse,
  OverseerrTVRequest,
  OverSeerrTVResponse,
} from '../../api/overseerr-api/overseerr-api.service';
import { PlexLibraryItem } from '../../api/plex-api/interfaces/library.interfaces';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import { IMediaServerService } from '../../api/media-server/media-server.interface';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
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
    // PlexApiService kept for getCorrectedUsers() - Plex.tv user mapping
    // TODO: Abstract to IMediaServerService.getUsers() in future phase
    private readonly plexApi: PlexApiService,
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

  async get(id: number, libItem: PlexLibraryItem, dataType?: EMediaDataType) {
    try {
      let origLibItem = undefined;
      let seasonMediaResponse: OverSeerrSeasonResponse = undefined;
      let tvMediaResponse: OverSeerrTVResponse = undefined;
      let movieMediaResponse: OverSeerrMovieResponse = undefined;

      // get original show in case of season / episode
      if (
        dataType === EMediaDataType.SEASONS ||
        dataType === EMediaDataType.EPISODES
      ) {
        origLibItem = _.cloneDeep(libItem);
        const mediaServer = await this.getMediaServer();
        libItem = (await mediaServer.getMetadata(
          dataType === EMediaDataType.SEASONS
            ? libItem.parentRatingKey
            : libItem.grandparentRatingKey,
        )) as unknown as PlexLibraryItem;
      }

      const prop = this.appProperties.find((el) => el.id === id);
      const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexData(libItem);
      // const overseerrUsers = await this.overseerrApi.getUsers();

      if (tmdb && tmdb.id) {
        if (libItem.type === 'movie') {
          movieMediaResponse = await this.overseerrApi.getMovie(
            tmdb.id.toString(),
          );
        } else {
          tvMediaResponse = await this.overseerrApi.getShow(tmdb.id.toString());
          if (
            dataType === EMediaDataType.SEASONS ||
            dataType === EMediaDataType.EPISODES
          ) {
            seasonMediaResponse = await this.overseerrApi.getSeason(
              tmdb.id.toString(),
              dataType === EMediaDataType.SEASONS
                ? origLibItem.index
                : origLibItem.parentIndex,
            );
            if (!seasonMediaResponse) {
              this.logger.debug(
                `Couldn't fetch season data for '${libItem.title}' season ${
                  dataType === EMediaDataType.SEASONS
                    ? origLibItem.index
                    : origLibItem.parentIndex
                } from Overseerr. As a result, unreliable results are expected.`,
              );
            }
          }
        }
      } else {
        this.logger.debug(
          `Couldn't find tmdb id for media '${libItem.title}' with id '${libItem.ratingKey}'. As a result, no Overseerr query could be made.`,
        );
      }

      const mediaResponse: OverSeerrTVResponse | OverSeerrMovieResponse =
        tvMediaResponse ?? movieMediaResponse;

      if (mediaResponse?.mediaInfo) {
        switch (prop.name) {
          case 'addUser': {
            try {
              const plexUsers = await this.plexApi.getCorrectedUsers();
              const userNames: string[] = [];
              if (mediaResponse.mediaInfo.requests) {
                for (const request of mediaResponse.mediaInfo.requests) {
                  // for seasons, only add if user requested the correct season
                  if (
                    (dataType === EMediaDataType.SEASONS ||
                      dataType === EMediaDataType.EPISODES) &&
                    request.type === 'tv'
                  ) {
                    const includesSeason = this.includesSeason(
                      request.seasons,
                      dataType === EMediaDataType.SEASONS
                        ? origLibItem.index
                        : origLibItem.parentIndex,
                    );
                    if (includesSeason) {
                      if (request.requestedBy?.userType === 2) {
                        userNames.push(request.requestedBy?.username);
                      } else {
                        const user = plexUsers.find(
                          (u) => u.plexId === request.requestedBy?.plexId,
                        )?.username;

                        if (user) {
                          userNames.push(user);
                        }
                      }
                    }
                  } else {
                    // for shows and movies, add every request user
                    if (request.requestedBy?.userType === 2) {
                      userNames.push(request.requestedBy?.username);
                    } else {
                      const user = plexUsers.find(
                        (u) => u.plexId === request.requestedBy?.plexId,
                      )?.username;

                      if (user) {
                        userNames.push(user);
                      }
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
            return [EMediaDataType.SEASONS, EMediaDataType.EPISODES].includes(
              dataType,
            )
              ? this.getSeasonRequests(origLibItem, tvMediaResponse).length
              : mediaResponse?.mediaInfo.requests.length;
          }
          case 'requestDate': {
            if (
              [EMediaDataType.SEASONS, EMediaDataType.EPISODES].includes(dataType)
            ) {
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
              if (EMediaDataType.EPISODES === dataType) {
                const ep = seasonMediaResponse.episodes?.find(
                  (el) => el.episodeNumber === origLibItem.index,
                );
                return ep?.airDate ? new Date(ep.airDate) : null;
              } else if (EMediaDataType.SEASONS === dataType) {
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
            if (
              [EMediaDataType.SEASONS, EMediaDataType.EPISODES].includes(dataType)
            ) {
              const season = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0];
              if (season && season.media) {
                if (
                  season.media.status >=
                  OverseerrMediaStatus.PARTIALLY_AVAILABLE
                ) {
                  return new Date(season.media.updatedAt);
                }
              }
              return null;
            } else {
              return mediaResponse?.mediaInfo.status >=
                OverseerrMediaStatus.PARTIALLY_AVAILABLE
                ? new Date(mediaResponse?.mediaInfo?.updatedAt)
                : null;
            }
          }
          case 'mediaAddedAt': {
            if (
              [EMediaDataType.SEASONS, EMediaDataType.EPISODES].includes(dataType)
            ) {
              const season = this.getSeasonRequests(
                origLibItem,
                tvMediaResponse,
              )[0];
              if (season && season.media) {
                if (
                  season.media.status >=
                  OverseerrMediaStatus.PARTIALLY_AVAILABLE
                ) {
                  return new Date(season.media.mediaAddedAt);
                }
              }
              return null;
            } else {
              return mediaResponse?.mediaInfo.status >=
                OverseerrMediaStatus.PARTIALLY_AVAILABLE
                ? new Date(mediaResponse?.mediaInfo?.mediaAddedAt)
                : null;
            }
          }
          case 'isRequested': {
            try {
              if (
                [EMediaDataType.SEASONS, EMediaDataType.EPISODES].includes(
                  dataType,
                )
              ) {
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
          `Couldn't fetch Overseerr metadate for media '${libItem.title}' with id '${libItem.ratingKey}'. As a result, no Overseerr query could be made.`,
        );
        return null;
      }
    } catch (e) {
      this.logger.warn(
        `Overseerr-Getter - Action failed for '${libItem.title}' with id '${libItem.ratingKey}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  private getSeasonRequests(
    libItem: PlexLibraryItem,
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
}
