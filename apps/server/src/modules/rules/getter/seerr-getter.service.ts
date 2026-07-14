import {
  MediaItem,
  MediaItemType,
  RequestMediaStatus,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  resolveRequestUsername,
  SeerrApiService,
  SeerrMovieResponse,
  SeerrRequest,
  SeerrSeasonRequest,
  SeerrSeasonResponse,
  SeerrTVRequest,
  SeerrTVResponse,
} from '../../api/seerr-api/seerr-api.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MetadataService } from '../../metadata/metadata.service';
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
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly metadataService: MetadataService,
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

      // get original show in case of season / episode
      if (dataType === 'season' || dataType === 'episode') {
        origLibItem = _.cloneDeep(libItem);
        const mediaServer = await this.mediaServerFactory.getService();
        libItem = await mediaServer.getMetadata(
          dataType === 'season' ? libItem.parentId : libItem.grandparentId,
        );
      }

      const prop = this.appProperties.find((el) => el.id === id);
      const resolvedIds =
        await this.metadataService.resolveIdsFromMediaItemForService(
          libItem,
          'seerr',
        );
      const tmdbId = resolvedIds?.tmdb as number | undefined;

      if (!tmdbId) {
        this.logger.debug(
          `Couldn't find tmdb id for media '${libItem.title}' with id '${libItem.id}'. As a result, no Seerr query could be made.`,
        );
        return null;
      }

      // releaseDate (movie releaseDate / tv firstAirDate / season|episode
      // airDate) is not carried by the /request list endpoint, so it keeps the
      // per-item getMovie/getShow/getSeason fallback. Accepted limitation -
      // releaseDate rules were not part of #3152.
      if (prop?.name === 'releaseDate') {
        return await this.getReleaseDate(
          libItem,
          origLibItem,
          dataType,
          tmdbId,
        );
      }

      // Every other Seerr property derives from the request set. Read the
      // run-scoped request index (one bulk /request sweep, deduped + cached)
      // instead of a per-item getMovie/getShow - the per-item path rate-limited
      // under whole-library runs and silently degraded matches to near-zero
      // (#3152).
      const requestsForMedia = await this.seerrApi.getRequestsForMedia(tmdbId);
      // undefined => the bulk sweep failed (Seerr unreachable). Transient: skip
      // so the comparator protects the item rather than treating it as "not
      // requested" (mirrors #3125).
      if (requestsForMedia === undefined) {
        return undefined;
      }

      // Reconstruct the per-title view the property logic expects. When the
      // title has no request the synthetic mediaInfo carries an empty request
      // list, so the switch yields the definitive "not requested" values
      // (0 / [] / null) - the core #3152 fix (these items previously
      // rate-limited to null and were skipped).
      const mediaResponse = this.toMediaResponse(requestsForMedia);
      const tvMediaResponse =
        libItem.type === 'movie'
          ? undefined
          : (mediaResponse as SeerrTVResponse);
      const requests = mediaResponse?.mediaInfo?.requests ?? [];

      if (mediaResponse?.mediaInfo) {
        switch (prop?.name) {
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

                  const username = resolveRequestUsername(request);
                  if (username) {
                    userNames.push(username);
                  }
                }
                return [...new Set(userNames)];
              }
              return [];
            } catch (error) {
              this.logger.warn("Couldn't get addUser from Seerr");
              this.logger.debug(error);
              return null;
            }
          }
          case 'amountRequested': {
            return dataType === 'season' || dataType === 'episode'
              ? this.getSeasonRequests(origLibItem, tvMediaResponse).length
              : requests.length;
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
            return dataType === 'season' || dataType === 'episode'
              ? this.getSeasonRequests(origLibItem, tvMediaResponse).length > 0
                ? 1
                : 0
              : requests.length > 0
                ? 1
                : 0;
          }
          default: {
            return null;
          }
        }
      } else {
        // Defensive only: toMediaResponse always yields a mediaInfo (empty
        // request list when the title has none), so this branch is unreachable
        // for the index path.
        return null;
      }
    } catch (error) {
      this.logger.warn(
        `Seerr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(
        `Seerr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Resolves the Seerr release/air date via the per-item getMovie/getShow/
   * getSeason endpoints. The bulk /request index carries request data, not the
   * TMDB release/air dates, so this property keeps the per-item fallback -
   * releaseDate-seeded rules were not part of #3152. A communication failure
   * returns `undefined` (transient skip, mirrors #3125); an untracked title
   * (no mediaInfo) returns `null`, preserving the prior behavior.
   */
  private async getReleaseDate(
    libItem: MediaItem,
    origLibItem: MediaItem | undefined,
    dataType: MediaItemType | undefined,
    tmdbId: number,
  ): Promise<Date | null | undefined> {
    let movieMediaResponse: SeerrMovieResponse = undefined;
    let tvMediaResponse: SeerrTVResponse = undefined;
    let seasonMediaResponse: SeerrSeasonResponse = undefined;

    if (libItem.type === 'movie') {
      movieMediaResponse = await this.seerrApi.getMovie(tmdbId.toString());
      if (movieMediaResponse === undefined) {
        return undefined;
      }
    } else {
      tvMediaResponse = await this.seerrApi.getShow(tmdbId.toString());
      if (tvMediaResponse === undefined) {
        return undefined;
      }
      if (dataType === 'season' || dataType === 'episode') {
        const seasonNumber =
          dataType === 'season' ? origLibItem.index : origLibItem.parentIndex;
        seasonMediaResponse = await this.seerrApi.getSeason(
          tmdbId.toString(),
          seasonNumber?.toString(),
        );
        if (!seasonMediaResponse) {
          this.logger.debug(
            `Couldn't fetch season data for '${libItem.title}' season ${seasonNumber} from Seerr. As a result, unreliable results are expected.`,
          );
        }
      }
    }

    const mediaResponse: SeerrTVResponse | SeerrMovieResponse =
      tvMediaResponse ?? movieMediaResponse;
    if (!mediaResponse?.mediaInfo) {
      return null;
    }

    if (libItem.type === 'movie') {
      return movieMediaResponse?.releaseDate
        ? new Date(movieMediaResponse.releaseDate)
        : null;
    }
    if (dataType === 'episode') {
      const ep = seasonMediaResponse?.episodes?.find(
        (el) => el.episodeNumber === origLibItem.index,
      );
      return ep?.airDate ? new Date(ep.airDate) : null;
    }
    if (dataType === 'season') {
      return seasonMediaResponse?.airDate
        ? new Date(seasonMediaResponse.airDate)
        : null;
    }
    return tvMediaResponse?.firstAirDate
      ? new Date(tvMediaResponse.firstAirDate)
      : null;
  }

  /**
   * Rebuilds the per-title response shape the property switch expects from the
   * flat request list returned by the run-scoped index. All requests for one
   * tmdbId share the same media (the /request list endpoint populates
   * request.media but not media.requests), so any request's media seeds the
   * synthetic mediaInfo and the grouped list is attached as its requests. An
   * empty list yields a mediaInfo with no requests, so the switch derives the
   * definitive "not requested" values.
   */
  private toMediaResponse(
    requests: SeerrRequest[],
  ): SeerrTVResponse | SeerrMovieResponse {
    const media = requests[0]?.media;
    return {
      id: media?.id,
      mediaInfo: {
        ...(media ?? {}),
        requests,
      },
    } as SeerrTVResponse | SeerrMovieResponse;
  }

  private getSeasonRequests(
    libItem: MediaItem,
    mediaResponse: SeerrTVResponse,
  ) {
    const seasonRequests: SeerrTVRequest[] = [];
    mediaResponse.mediaInfo?.requests?.forEach((el) => {
      const season = el.seasons?.find(
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
    const season = seasons?.find(
      (season) => season.seasonNumber === seasonNumber,
    );
    return season !== undefined;
  }
}
