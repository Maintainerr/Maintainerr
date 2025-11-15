import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlexLibraryItem } from '../../../modules/api/plex-api/interfaces/library.interfaces';
import { EPlexDataType } from '../../api/plex-api/enums/plex-data-type-enum';
import { PlexApiService } from '../../api/plex-api/plex-api.service';
import {
  TautulliApiService,
  TautulliHistoryRequestOptions,
  TautulliMetadata,
} from '../../api/tautulli-api/tautulli-api.service';
import { Collection } from '../../collections/entities/collection.entities';
import { MaintainerrLogger } from '../../logging/logs.service';
import {
  Application,
  Property,
  RuleConstants,
} from '@maintainerr/contracts';
import { RulesDto } from '../dtos/rules.dto';

@Injectable()
export class TautulliGetterService {
  appProperties: Property[];

  constructor(
    private readonly tautulliApi: TautulliApiService,
    private readonly plexApi: PlexApiService,
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TautulliGetterService.name);
    const ruleConstanst = new RuleConstants();
    this.appProperties = ruleConstanst.applications.find(
      (el) => el.id === Application.TAUTULLI,
    ).props;
  }

  async get(
    id: number,
    libItem: PlexLibraryItem,
    dataType?: EPlexDataType,
    ruleGroup?: RulesDto,
  ) {
    try {
      const prop = this.appProperties.find((el) => el.id === id);
      const metadata = await this.tautulliApi.getMetadata(libItem.ratingKey);
      const collection = await this.collectionRepository.findOne({
        where: { id: ruleGroup.collection.id },
      });
      const tautulliWatchedPercentOverride =
        collection.tautulliWatchedPercentOverride;

      switch (prop.name) {
        case 'seenBy':
        case 'sw_watchers': {
          const history = await this.getHistoryForMetadata(metadata);

          if (history.length > 0) {
            const viewerIds = history
              .filter((x) =>
                tautulliWatchedPercentOverride != null
                  ? x.percent_complete >= tautulliWatchedPercentOverride
                  : x.watched_status == 1,
              )
              .map((el) => el.user_id);

            const uniqueViewerIds = [...new Set(viewerIds)];
            const plexUsernames =
              await this.getPlexUsernamesForIds(uniqueViewerIds);

            return plexUsernames;
          } else {
            return [];
          }
        }
        case 'sw_allEpisodesSeenBy': {
          const users = await this.tautulliApi.getUsers();
          let seasons: TautulliMetadata[];

          if (metadata.media_type !== 'season') {
            seasons = await this.tautulliApi.getChildrenMetadata(
              metadata.rating_key,
            );
          } else {
            seasons = [metadata];
          }

          const allViewers = users.slice();
          for (const season of seasons) {
            const episodes = await this.tautulliApi.getChildrenMetadata(
              season.rating_key,
            );

            for (const episode of episodes) {
              const viewers = await this.tautulliApi.getHistory({
                rating_key: episode.rating_key,
              });

              const arrLength = allViewers.length - 1;
              allViewers
                .slice()
                .reverse()
                .forEach((el, idx) => {
                  if (
                    !viewers?.find(
                      (viewEl) =>
                        (tautulliWatchedPercentOverride != null
                          ? viewEl.percent_complete >=
                            tautulliWatchedPercentOverride
                          : viewEl.watched_status == 1) &&
                        el.user_id === viewEl.user_id,
                    )
                  ) {
                    allViewers.splice(arrLength - idx, 1);
                  }
                });
            }
          }

          if (allViewers.length > 0) {
            const plexUsernames = await this.getPlexUsernamesForIds(
              allViewers.map((x) => x.user_id),
            );
            return plexUsernames;
          }

          return [];
        }
        case 'addDate': {
          return new Date(+metadata.added_at * 1000);
        }
        case 'viewCount':
        case 'sw_amountOfViews': {
          const history = await this.getHistoryForMetadata(metadata);
          const watchedContent = history.filter((x) =>
            tautulliWatchedPercentOverride != null
              ? x.percent_complete >= tautulliWatchedPercentOverride
              : x.watched_status == 1,
          );
          return watchedContent.length;
        }
        case 'lastViewedAt': {
          // get_metadata has a last_viewed_at field which would be easier but it's not correct
          const history = await this.getHistoryForMetadata(metadata);
          const sortedHistory = history
            .filter((x) =>
              tautulliWatchedPercentOverride != null
                ? x.percent_complete >= tautulliWatchedPercentOverride
                : x.watched_status == 1,
            )
            .map((el) => el.stopped)
            .sort()
            .reverse();

          return sortedHistory.length > 0
            ? new Date(sortedHistory[0] * 1000)
            : null;
        }
        case 'sw_viewedEpisodes': {
          const history = await this.getHistoryForMetadata(metadata);

          const watchedEpisodes = history
            .filter((x) =>
              tautulliWatchedPercentOverride != null
                ? x.percent_complete >= tautulliWatchedPercentOverride
                : x.watched_status == 1,
            )
            .map((x) => x.rating_key);

          const uniqueEpisodes = [...new Set(watchedEpisodes)];

          return uniqueEpisodes.length;
        }
        case 'sw_lastWatched': {
          let history = await this.getHistoryForMetadata(metadata);

          history
            .filter((x) =>
              tautulliWatchedPercentOverride != null
                ? x.percent_complete >= tautulliWatchedPercentOverride
                : x.watched_status == 1,
            )
            .sort((a, b) => a.parent_media_index - b.parent_media_index)
            .reverse();

          history = history.filter(
            (el) => el.parent_media_index === history[0].parent_media_index,
          );
          history.sort((a, b) => a.media_index - b.media_index).reverse();

          return history.length > 0
            ? new Date(history[0].stopped * 1000)
            : null;
        }
        default: {
          return null;
        }
      }
    } catch (e) {
      this.logger.warn(
        `Tautulli-Getter - Action failed for '${libItem.title}' with id '${libItem.ratingKey}': ${e.message}`,
      );
      this.logger.debug(e);
      return undefined;
    }
  }

  private async getHistoryForMetadata(metadata: TautulliMetadata) {
    const options: TautulliHistoryRequestOptions = {};

    if (metadata.media_type == 'movie' || metadata.media_type == 'episode') {
      options.rating_key = metadata.rating_key;
    } else if (metadata.media_type == 'season') {
      options.parent_rating_key = metadata.rating_key;
    } else if (metadata.media_type == 'show') {
      options.grandparent_rating_key = metadata.rating_key;
    } else {
      return [];
    }

    const history = await this.tautulliApi.getHistory(options);
    return history;
  }

  private getPlexUsernamesForIds = async (plexIds: number[]) => {
    const plexUsers = await this.plexApi.getCorrectedUsers();

    return plexIds.reduce((acc, x) => {
      const plexUsername = plexUsers.find((u) => u.plexId === x)?.username;

      if (plexUsername) {
        acc.push(plexUsername);
      }

      return acc;
    }, [] as string[]);
  };
}
