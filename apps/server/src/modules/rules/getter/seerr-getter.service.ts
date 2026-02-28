import {
  MediaItem,
  MediaItemType,
  RequestMediaStatus,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  SeerrApiService,
  SeerrMovieResponse,
  SeerrSeasonRequest,
  SeerrSeasonResponse,
  SeerrTVRequest,
  SeerrTVResponse,
} from '../../api/seerr-api/seerr-api.service';
import { TmdbIdService } from '../../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';

@Injectable()
export class SeerrGetterService {
  appProperties: Property[];

  constructor(
    private readonly seerrApi: SeerrApiService,
    private readonly tmdbApi: TmdbApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly tmdbIdHelper: TmdbIdService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SeerrGetterService.name);
    const ruleConstants = new RuleConstants();
    this.appProperties = ruleConstants.applications.find(
      (el) => el.id === Application.SEERR,
    ).props;
  }

  async get(id: number, libItem: MediaItem, dataType?: MediaItemType) {
    try {
      let origLibItem: MediaItem = undefined;
      let seasonMediaResponse: SeerrSeasonResponse = undefined;
      let tvMediaResponse: SeerrTVResponse = undefined;
      let movieMediaResponse: SeerrMovieResponse = undefined;

      // get original show in case of season / episode
      if (dataType === 'season' || dataType === 'episode') {
        origLibItem = _.cloneDeep(libItem);
        const mediaServer = await this.mediaServerFactory.getService();
        libItem = await mediaServer.getMetadata(
          dataType === 'season' ? libItem.parentId : libItem.grandparentId,
        );
      }

      const prop = this.appProperties.find((el) => el.id === id);
      const tmdb = await this.tmdbIdHelper.getTmdbIdFromMediaItem(libItem);

      if (tmdb && tmdb.id) {
        if (libItem.type === 'movie') {
          movieMediaResponse = await this.seerrApi.getMovie(tmdb.id.toString());
        } else {
          tvMediaResponse = await this.seerrApi.getShow(tmdb.id.toString());
          if (dataType === 'season' || dataType === 'episode') {
            const seasonNumber =
              dataType === 'season'
                ? origLibItem.index
                : origLibItem.parentIndex;
            seasonMediaResponse = await this.seerrApi.getSeason(
              tmdb.id.toString(),
              seasonNumber?.toString(),
            );
            if (!seasonMediaResponse) {
              this.logger.debug(
                `Couldn't fetch season data for '${libItem.title}' season ${seasonNumber} from Seerr. As a result, unreliable results are expected.`,
              );
            }
          }
        }
      } else {
        this.logger.debug(
          `Couldn't find tmdb id for media '${libItem.title}' with id '${libItem.id}'. As a result, no Seerr query could be made.`,
        );
      }

      const mediaResponse: SeerrTVResponse | SeerrMovieResponse =
        tvMediaResponse ?? movieMediaResponse;

      if (mediaResponse?.mediaInfo) {
        switch (prop.name) {
          case 'addUser': {
            try {
              const userNames: string[] = [];
              if (mediaResponse.mediaInfo.requests) {
                for (const request of mediaResponse.mediaInfo.requests) {
                  const isSeasonOrEpisode =
                    dataType === 'season' || dataType === 'episode';

                  // For seasons/episodes, only include if the request covers the correct season
                  if (
                    isSeasonOrEpisode &&
                    request.type === 'tv' &&
                    !this.includesSeason(
                      request.seasons,
                      dataType === 'season'
                        ? origLibItem.index
                        : origLibItem.parentIndex,
                    )
                  ) {
                    continue;
                  }

                  const username = this.resolveRequestUsername(request);
                  if (username) {
                    userNames.push(username);
                  }
                }
                return [...new Set(userNames)];
              }
              return [];
            } catch (e) {
              this.logger.warn("Couldn't get addUser from Seerr");
              this.logger.debug(e);
              return null;
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
          `Couldn't fetch Seerr metadata for media '${libItem.title}' with id '${libItem.id}'. As a result, no Seerr query could be made.`,
        );
        return null;
      }
    } catch (e) {
      this.logger.warn(
        `Seerr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  private getSeasonRequests(
    libItem: MediaItem,
    mediaResponse: SeerrTVResponse,
  ) {
    const seasonRequests: SeerrTVRequest[] = [];
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

  private includesSeason(seasons: SeerrSeasonRequest[], seasonNumber: number) {
    const season = seasons.find(
      (season) => season.seasonNumber === seasonNumber,
    );
    return season !== undefined;
  }

  /**
   * Resolves the username from a Seerr request.
   *
   * Uses the username fields directly from the Seerr API response
   * rather than looking up users by ID on the media server, because
   * media server user IDs don't match Seerr's plexId (Plex.tv ID).
   *
   * Seerr user types store their name in different fields:
   * - Plex (1): plexUsername
   * - Local (2): username
   * - Jellyfin (3) / Emby (4): jellyfinUsername
   */
  private resolveRequestUsername(request: {
    requestedBy?: {
      plexUsername?: string;
      jellyfinUsername?: string;
      username?: string;
    };
  }): string | undefined {
    const user = request.requestedBy;
    if (!user) return undefined;

    return (
      user.plexUsername || user.jellyfinUsername || user.username || undefined
    );
  }
}
