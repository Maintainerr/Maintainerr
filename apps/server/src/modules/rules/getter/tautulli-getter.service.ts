import {
  isPerUserProperty,
  MediaItem,
  MediaItemType,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
} from '../constants/rules.constants';
import { RuleDto } from '../dtos/rule.dto';
import { RuleGroupDto } from '../dtos/ruleGroup.dto';

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
    libItem: MediaItem,
    dataType?: MediaItemType,
    ruleGroup?: RuleGroupDto,
    currentRule?: RuleDto,
  ) {
    try {
      const prop = this.appProperties.find((el) => el.id === id);

      const metadata = await this.tautulliApi.getMetadata(libItem.id);
      // Tautulli answers null both for an item it does not know and for a failed
      // read, so this keeps the transient contract. Reading through the null
      // threw instead, which surfaced as the same signal behind a misleading
      // "Action failed" warning.
      if (!metadata) {
        return undefined;
      }
      const collection = await this.collectionRepository.findOne({
        where: { id: ruleGroup.collection.id },
      });
      const tautulliWatchedPercentOverride =
        collection.tautulliWatchedPercentOverride;

      if (isPerUserProperty(prop.name)) {
        return await this.getUserStat(
          prop.name,
          metadata,
          currentRule,
          tautulliWatchedPercentOverride,
        );
      }

      switch (prop.name) {
        // At season/show level `sw_watchers` returns the UNION of users that
        // watched any descendant episode - not the intersection. Tautulli's
        // history aggregates child views via grandparent_rating_key /
        // parent_rating_key, so any account that watched at least one
        // episode appears here. Use `sw_allEpisodesSeenBy` when you need
        // "watched every episode" semantics instead.
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
              // An unreadable episode history would read as "nobody watched
              // this episode" and empty the whole list.
              if (!viewers) {
                throw new Error(
                  `Tautulli could not answer the watch history for episode ${episode.rating_key}`,
                );
              }

              const arrLength = allViewers.length - 1;
              allViewers
                .slice()
                .reverse()
                .forEach((el, idx) => {
                  if (
                    !viewers.find(
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
        case 'lastPlayedAt': {
          // Tautulli writes a row per playback session, so the newest stop
          // time is the last play attempt regardless of watched status.
          const stopped = (await this.getHistoryForMetadata(metadata))
            .map((el) => el.stopped)
            .filter((value) => typeof value === 'number');

          return stopped.length > 0
            ? new Date(Math.max(...stopped) * 1000)
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
          const history = (await this.getHistoryForMetadata(metadata)).filter(
            (x) =>
              tautulliWatchedPercentOverride != null
                ? x.percent_complete >= tautulliWatchedPercentOverride
                : x.watched_status == 1,
          );

          if (history.length === 0) {
            return null;
          }

          history.sort((a, b) => b.parent_media_index - a.parent_media_index);
          const newestSeason = history.filter(
            (el) => el.parent_media_index === history[0].parent_media_index,
          );
          newestSeason.sort((a, b) => b.media_index - a.media_index);

          return new Date(newestSeason[0].stopped * 1000);
        }
        default: {
          return null;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Tautulli-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(
        `Tautulli-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Per-user statistics for the rule's user. Views and the last view date
   * count watched plays only, honouring the collection's watched-percent
   * override like the whole-item properties; watch time counts every play,
   * since an abandoned one still ran for its minutes.
   *
   * Resolves the username through the plex.tv-corrected list the rule editor
   * offers, and answers `undefined` when it cannot: zero would read as "this
   * user watched nothing" after a rename or a plex.tv outage.
   */
  private async getUserStat(
    propName: string,
    metadata: TautulliMetadata,
    currentRule: RuleDto | undefined,
    tautulliWatchedPercentOverride: number | null,
  ): Promise<number | Date | null | undefined> {
    const username = currentRule?.username;
    if (!username) {
      this.logger.warn(
        `Tautulli-Getter - Skipping '${propName}': the rule has no user selected.`,
      );
      return undefined;
    }

    const plexUsers = await this.plexApi.getCorrectedUsers();
    const plexUser = plexUsers.find((user) => user.username === username);
    if (!plexUser) {
      this.logger.warn(
        `Tautulli-Getter - Skipping '${propName}': Plex has no user named '${username}'.`,
      );
      return undefined;
    }

    const history = (await this.getHistoryForMetadata(metadata)).filter(
      (el) => el.user_id === plexUser.plexId,
    );

    if (propName === 'watchTimeByUser') {
      const seconds = history.reduce(
        (total, el) => total + (el.play_duration ?? el.duration ?? 0),
        0,
      );
      return Math.round(seconds / 60);
    }

    const watchedHistory = history.filter((el) =>
      tautulliWatchedPercentOverride != null
        ? el.percent_complete >= tautulliWatchedPercentOverride
        : el.watched_status == 1,
    );

    if (propName === 'viewCountByUser') {
      return watchedHistory.length;
    }

    const lastStopped = watchedHistory.reduce(
      (latest, el) => (el.stopped > latest ? el.stopped : latest),
      0,
    );
    return lastStopped > 0 ? new Date(lastStopped * 1000) : null;
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
    // null is a failed read, not an empty history - throw into the outer
    // catch so the item pauses instead of reading as never watched.
    if (!history) {
      throw new Error(
        `Tautulli could not answer the watch history for item ${metadata.rating_key}`,
      );
    }
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
