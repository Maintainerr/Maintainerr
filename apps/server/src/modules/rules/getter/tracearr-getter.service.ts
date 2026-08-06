import {
  isPerUserProperty,
  MediaItem,
  MediaType,
  TracearrHistoryItem,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  TracearrApiService,
  TracearrHistoryIndex,
} from '../../api/tracearr-api/tracearr-api.service';
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
export class TracearrGetterService {
  private readonly appProperties: Property[];
  private historyIndexForWatchedPercentOverrides:
    TracearrHistoryIndex | undefined;
  private watchedPercentOverridesByCollectionId = new Map<
    number,
    Promise<number | null>
  >();

  constructor(
    private readonly tracearrApi: TracearrApiService,
    @InjectRepository(Collection)
    private readonly collectionRepository: Repository<Collection>,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TracearrGetterService.name);
    const ruleConstants = new RuleConstants();
    this.appProperties = ruleConstants.applications.find(
      (application) => application.id === Application.TRACEARR,
    ).props;
  }

  async get(
    id: number,
    libItem: MediaItem,
    ruleGroup?: RuleGroupDto,
    currentRule?: RuleDto,
  ) {
    try {
      const property = this.appProperties.find((item) => item.id === id);
      if (!property) {
        return null;
      }
      // A property that does not apply to this item type is a definitive
      // answer, not a failed lookup - and because the executor sweeps a whole
      // library at one dataType, the transient signal froze every item in the
      // group. Every other getter answers `null` here.
      if (!this.supportsMediaItem(property, libItem)) {
        return null;
      }

      let historyIndex = this.tracearrApi.getHistoryIndex();
      if (!historyIndex) {
        await this.tracearrApi.prefetchHistory();
        historyIndex = this.tracearrApi.getHistoryIndex();
      }
      if (!historyIndex) {
        return undefined;
      }

      const watchedPercentOverride = await this.getWatchedPercentOverride(
        ruleGroup,
        historyIndex,
      );
      const history = this.getHistoryForItem(historyIndex, libItem);
      if (!history) {
        return undefined;
      }
      if (
        history.length === 0 &&
        this.isBeforeHistoryCoverage(libItem, historyIndex)
      ) {
        return undefined;
      }

      const watchedHistory = history.filter((item) =>
        this.isWatched(item, watchedPercentOverride),
      );

      if (isPerUserProperty(property.name)) {
        return this.getUserStat(
          property.name,
          currentRule,
          history,
          watchedHistory,
        );
      }

      switch (property.name) {
        case 'seenBy':
        case 'sw_watchers':
          return await this.getUsernames(watchedHistory);
        case 'sw_allEpisodesSeenBy':
          return await this.getAllEpisodesSeenBy(
            historyIndex,
            libItem,
            watchedPercentOverride,
          );
        case 'viewCount':
        case 'sw_amountOfViews':
          return watchedHistory.length;
        case 'lastViewedAt':
          return this.getLatestViewedAt(watchedHistory);
        case 'sw_viewedEpisodes':
          return new Set(
            watchedHistory
              .filter((item) => item.rating_key != null)
              .map((item) => item.rating_key),
          ).size;
        case 'sw_lastWatched':
          return this.getNewestEpisodeViewedAt(watchedHistory);
        default:
          return null;
      }
    } catch (error) {
      this.logger.warn(
        `Tracearr-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  private async getWatchedPercentOverride(
    ruleGroup?: RuleGroupDto,
    historyIndex?: TracearrHistoryIndex,
  ): Promise<number | null> {
    if (this.historyIndexForWatchedPercentOverrides !== historyIndex) {
      this.historyIndexForWatchedPercentOverrides = historyIndex;
      this.watchedPercentOverridesByCollectionId.clear();
    }

    const collectionId = ruleGroup?.collection?.id;
    if (collectionId == null) {
      return ruleGroup?.tautulliWatchedPercentOverride ?? null;
    }

    const existing =
      this.watchedPercentOverridesByCollectionId.get(collectionId);
    if (existing !== undefined) {
      return await existing;
    }

    const watchedPercentOverride = this.collectionRepository
      .findOne({ where: { id: collectionId } })
      .then((collection) => collection?.tautulliWatchedPercentOverride ?? null);
    this.watchedPercentOverridesByCollectionId.set(
      collectionId,
      watchedPercentOverride,
    );
    return await watchedPercentOverride;
  }

  private supportsMediaItem(property: Property, libItem: MediaItem): boolean {
    if (property.mediaType === MediaType.MOVIE && libItem.type !== 'movie') {
      return false;
    }
    if (property.mediaType === MediaType.SHOW && libItem.type === 'movie') {
      return false;
    }

    return !property.showType || property.showType.includes(libItem.type);
  }

  private getHistoryForItem(
    historyIndex: TracearrHistoryIndex,
    libItem: MediaItem,
  ): TracearrHistoryItem[] | undefined {
    if (libItem.type === 'movie' || libItem.type === 'episode') {
      return historyIndex.rowsByRatingKey.get(libItem.id) ?? [];
    }

    const showRatingKey =
      libItem.type === 'show' ? libItem.id : libItem.parentId;
    if (!showRatingKey) {
      return undefined;
    }

    const showHistory =
      historyIndex.rowsByShowRatingKey.get(showRatingKey) ?? [];
    if (libItem.type === 'show') {
      return showHistory;
    }
    if (libItem.index === undefined) {
      return undefined;
    }

    return showHistory.filter((item) => item.season_number === libItem.index);
  }

  private isWatched(
    history: TracearrHistoryItem,
    watchedPercentOverride: number | null,
  ): boolean {
    if (watchedPercentOverride != null) {
      return (
        history.percent_complete != null &&
        history.percent_complete >= watchedPercentOverride
      );
    }

    return history.watched;
  }

  private isBeforeHistoryCoverage(
    libItem: MediaItem,
    historyIndex: TracearrHistoryIndex,
  ): boolean {
    const addedAt = libItem.addedAt.getTime();
    return Number.isNaN(addedAt) || addedAt < historyIndex.earliestStartedAt;
  }

  /**
   * Per-user statistics for the rule's user. Views and the last view date
   * count watched plays only, honouring the collection's watched-percent
   * override like the whole-item properties; watch time counts every play,
   * since an abandoned one still ran for its minutes.
   *
   * A username Tracearr has no account for answers `undefined`: zero would
   * read as "this user watched nothing" after a rename or an unlink.
   */
  private getUserStat(
    propName: string,
    currentRule: RuleDto | undefined,
    history: TracearrHistoryItem[],
    watchedHistory: TracearrHistoryItem[],
  ): number | Date | null | undefined {
    const username = currentRule?.username;
    if (!username) {
      this.logger.warn(
        `Tracearr-Getter - Skipping '${propName}': the rule has no user selected.`,
      );
      return undefined;
    }

    const usernamesByTracearrUserId =
      this.tracearrApi.getUsernamesByTracearrUserId();
    if (!usernamesByTracearrUserId) {
      return undefined;
    }

    const tracearrUserIds = new Set(
      [...usernamesByTracearrUserId.entries()]
        .filter(([, usernames]) => usernames.includes(username))
        .map(([tracearrUserId]) => tracearrUserId),
    );
    if (tracearrUserIds.size === 0) {
      this.logger.warn(
        `Tracearr-Getter - Skipping '${propName}': Tracearr has no account for user '${username}'.`,
      );
      return undefined;
    }

    if (propName === 'watchTimeByUser') {
      const milliseconds = history
        .filter((item) => tracearrUserIds.has(item.user.id))
        .reduce((total, item) => total + (item.duration_ms ?? 0), 0);
      return Math.round(milliseconds / 60000);
    }

    const userHistory = watchedHistory.filter((item) =>
      tracearrUserIds.has(item.user.id),
    );

    return propName === 'viewCountByUser'
      ? userHistory.length
      : this.getLatestViewedAt(userHistory);
  }

  private getUsernames(history: TracearrHistoryItem[]): string[] | undefined {
    const tracearrUserIds = [...new Set(history.map((item) => item.user.id))];
    return this.getUsernamesForTracearrUserIds(tracearrUserIds);
  }

  private getUsernamesForTracearrUserIds(
    tracearrUserIds: string[],
  ): string[] | undefined {
    if (tracearrUserIds.length === 0) {
      return [];
    }

    const usernamesByTracearrUserId =
      this.tracearrApi.getUsernamesByTracearrUserId();
    if (!usernamesByTracearrUserId) {
      return undefined;
    }

    return [
      ...new Set(
        tracearrUserIds.flatMap(
          (tracearrUserId) =>
            usernamesByTracearrUserId.get(tracearrUserId) ?? [],
        ),
      ),
    ];
  }

  private async getAllEpisodesSeenBy(
    historyIndex: TracearrHistoryIndex,
    libItem: MediaItem,
    watchedPercentOverride: number | null,
  ): Promise<string[] | undefined> {
    const episodeIds = await this.tracearrApi.getEpisodeIds(libItem);
    if (!episodeIds) {
      return undefined;
    }
    if (episodeIds.length === 0) {
      return [];
    }

    let usersWhoWatchedAll: Set<string> | undefined;
    for (const episodeId of episodeIds) {
      const watchedUserIds = new Set(
        (historyIndex.rowsByRatingKey.get(episodeId) ?? [])
          .filter((item) => this.isWatched(item, watchedPercentOverride))
          .map((item) => item.user.id),
      );

      if (watchedUserIds.size === 0) {
        return [];
      }

      usersWhoWatchedAll = usersWhoWatchedAll
        ? new Set(
            [...usersWhoWatchedAll].filter((id) => watchedUserIds.has(id)),
          )
        : watchedUserIds;
      if (usersWhoWatchedAll.size === 0) {
        return [];
      }
    }

    return this.getUsernamesForTracearrUserIds([...usersWhoWatchedAll]);
  }

  private getLatestViewedAt(history: TracearrHistoryItem[]): Date | null {
    const timestamps = history
      .map((item) => item.stopped_at)
      .filter((value): value is string => value != null)
      .map((value) => new Date(value).getTime());

    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
  }

  private getNewestEpisodeViewedAt(
    history: TracearrHistoryItem[],
  ): Date | null | undefined {
    if (history.length === 0) {
      return null;
    }
    const numberedHistory = history.filter(
      (item) => item.season_number != null && item.episode_number != null,
    );
    if (numberedHistory.length === 0) {
      return null;
    }

    const ordered = [...numberedHistory].sort((left, right) => {
      if (right.season_number !== left.season_number) {
        return right.season_number - left.season_number;
      }
      return right.episode_number - left.episode_number;
    });
    const newest = ordered[0];
    const timestamps = ordered
      .filter(
        (item) =>
          item.season_number === newest.season_number &&
          item.episode_number === newest.episode_number &&
          item.stopped_at != null,
      )
      .map((item) => new Date(item.stopped_at).getTime());

    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
  }
}
