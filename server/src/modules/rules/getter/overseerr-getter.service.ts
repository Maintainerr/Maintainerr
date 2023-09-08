import { Injectable, Logger } from '@nestjs/common';
import { warn } from 'console';
import {
  OverseerrApiService,
  OverSeerrMediaResponse,
  OverseerrMediaStatus,
} from '../../../modules/api/overseerr-api/overseerr-api.service';
import {
  PlexLibraryItem,
  PlexUser,
} from '../../../modules/api/plex-api/interfaces/library.interfaces';
import { PlexApiService } from '../../../modules/api/plex-api/plex-api.service';
import { TmdbIdService } from '../../../modules/api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../../../modules/api/tmdb-api/tmdb.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { EPlexDataType } from 'src/modules/api/plex-api/enums/plex-data-type-enum';
import _ from 'lodash';

@Injectable()
export class OverseerrGetterService {
  appProperties: Property[];
  private readonly logger = new Logger(OverseerrGetterService.name);

  constructor(
    private readonly overseerrApi: OverseerrApiService,
    private readonly tmdbApi: TmdbApiService,
    private readonly plexApi: PlexApiService,
    private readonly tmdbIdHelper: TmdbIdService,
  ) {
    const ruleConstanst = new RuleConstants();
    this.appProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.OVERSEERR,
    ).props;
  }

  async get(id: number, libItem: PlexLibraryItem, dataType?: EPlexDataType) {
    try {
      let origLibItem = undefined;
      let seasonMediaResponse = undefined;

      // get original show in case of season / episode
      if (
        dataType === EPlexDataType.SEASONS ||
        dataType === EPlexDataType.EPISODES
      ) {
        origLibItem = _.cloneDeep(libItem);
        libItem = (await this.plexApi.getMetadata(
          libItem.parentRatingKey,
        )) as unknown as PlexLibraryItem;
      }

      const prop = this.appProperties.find((el) => el.id === id);
      const tmdb = await this.tmdbIdHelper.getTmdbIdFromPlexData(libItem);

      let mediaResponse: OverSeerrMediaResponse;
      if (tmdb && tmdb.id) {
        if (libItem.type === 'movie') {
          mediaResponse = await this.overseerrApi.getMovie(tmdb.id.toString());
        } else {
          mediaResponse = await this.overseerrApi.getShow(tmdb.id.toString());
          if (
            dataType === EPlexDataType.SEASONS ||
            dataType === EPlexDataType.EPISODES
          ) {
            seasonMediaResponse = await this.overseerrApi.getShow(
              tmdb.id.toString(),
              origLibItem.index,
            );
          }
        }
      }
      if (mediaResponse && mediaResponse.mediaInfo) {
        switch (prop.name) {
          case 'addUser': {
            try {
              const plexUsers = (await this.plexApi.getUsers()).map((el) => {
                return { plexId: el.id, username: el.name } as PlexUser;
              });
              const userNames: string[] = [];
              if (
                mediaResponse &&
                mediaResponse.mediaInfo &&
                mediaResponse.mediaInfo.requests
              ) {
                for (const request of mediaResponse.mediaInfo.requests) {
                  userNames.push(
                    plexUsers.find(
                      (u) => u.username === request.requestedBy?.plexUsername,
                    )?.username,
                  );
                }
                return userNames;
              }
              return [];
            } catch (e) {
              this.logger.warn("Couldn't get addUser from Overseerr", {
                label: 'Overseerr API',
                errorMessage: e.message,
              });
            }
          }
          case 'amountRequested': {
            return mediaResponse?.mediaInfo.requests.length;
          }
          case 'requestDate': {
            return mediaResponse?.mediaInfo?.requests[0]?.createdAt
              ? new Date(mediaResponse?.mediaInfo?.requests[0]?.createdAt)
              : null;
          }
          case 'releaseDate': {
            return mediaResponse?.releaseDate
              ? new Date(mediaResponse?.releaseDate)
              : null;
          }
          case 'approvalDate': {
            return mediaResponse?.mediaInfo.status >=
              OverseerrMediaStatus.PARTIALLY_AVAILABLE
              ? new Date(mediaResponse?.mediaInfo?.updatedAt)
              : null;
          }
          case 'mediaAddedAt': {
            return mediaResponse?.mediaInfo.status >=
              OverseerrMediaStatus.PARTIALLY_AVAILABLE
              ? new Date(mediaResponse?.mediaInfo?.mediaAddedAt)
              : null;
          }
          case 'isRequested': {
            return mediaResponse?.mediaInfo.requests.length > 0 ? 1 : 0;
          }
          default: {
            return null;
          }
        }
      } else {
        return null;
      }
    } catch (e) {
      warn(`Overseerr-Getter - Action failed : ${e.message}`);
      return undefined;
    }
  }
}
