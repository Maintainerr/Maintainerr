import { MediaItem, MediaItemType } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { cloneDeep } from 'lodash';
import { MediaServerFactory } from '../../api/media-server/media-server.factory';
import {
  childRequestsForSeason,
  ombiDate,
  OmbiApiService,
  OmbiChildRequest,
  resolveOmbiRequester,
} from '../../api/ombi-api/ombi-api.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MetadataService } from '../../metadata/metadata.service';
import {
  Application,
  Property,
  RuleConstants,
} from '../constants/rules.constants';
import { ArrLookupCache } from '../helpers/arr-lookup-cache';

const earliest = (dates: (Date | null)[]): Date | null =>
  dates.reduce<Date | null>(
    (min, date) => (date && (!min || date < min) ? date : min),
    null,
  );

// A 4K-only movie request stamps only the 4K date.
const requestedAt = (request: {
  requestedDate: string;
  requestedDate4k?: string;
}): Date | null =>
  ombiDate(request.requestedDate) ?? ombiDate(request.requestedDate4k);

// Ombi stamps markedAsApproved on a manual approval only. An auto-approved
// request is approved the moment it is made, so its request date stands in.
const approvedAt = (request: {
  approved: boolean;
  markedAsApproved: string;
  requestedDate: string;
  requestedDate4k?: string;
}): Date | null =>
  request.approved
    ? (ombiDate(request.markedAsApproved) ?? requestedAt(request))
    : null;

@Injectable()
export class OmbiGetterService {
  appProperties: Property[];

  constructor(
    private readonly ombiApi: OmbiApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(OmbiGetterService.name);
    const ruleConstants = new RuleConstants();
    this.appProperties = ruleConstants.applications.find(
      (el) => el.id === Application.OMBI,
    ).props;
  }

  async get(
    id: number,
    libItem: MediaItem,
    dataType?: MediaItemType,
    arrLookupCache?: ArrLookupCache,
  ) {
    try {
      let origLibItem: MediaItem = undefined;

      // Ombi keys shows by TMDB id, so seasons and episodes read their show.
      if (dataType === 'season' || dataType === 'episode') {
        origLibItem = cloneDeep(libItem);
        const mediaServer = await this.mediaServerFactory.getService();
        libItem = await mediaServer.getMetadata(
          dataType === 'season' ? libItem.parentId : libItem.grandparentId,
        );
      }

      const prop = this.appProperties.find((el) => el.id === id);
      // Same run-scoped memo as the Seerr getter: one id resolution per item,
      // evicted when it yields no tmdb so a transient failure retries.
      const resolveIds = () =>
        this.metadataService.resolveIdsFromMediaItemForService(libItem, 'ombi');
      const resolvedIds = await (arrLookupCache
        ? arrLookupCache.memoize(
            `metadata:ombi:${libItem.id}`,
            resolveIds,
            (ids) => !ids?.tmdb,
          )
        : resolveIds());
      const tmdbId = resolvedIds?.tmdb as number | undefined;

      if (!tmdbId) {
        this.logger.debug(
          `Couldn't find tmdb id for media '${libItem.title}' with id '${libItem.id}'. As a result, no Ombi query could be made.`,
        );
        // Transient: not being able to look it up is not "not requested".
        return undefined;
      }

      return libItem.type === 'movie'
        ? await this.getMovieValue(prop?.name, tmdbId)
        : await this.getShowValue(prop?.name, tmdbId, dataType, origLibItem);
    } catch (error) {
      this.logger.warn(
        `Ombi-Getter - Action failed for '${libItem.title}' with id '${libItem.id}'`,
      );
      this.logger.debug(error);
      return undefined;
    }
  }

  private async getMovieValue(name: string | undefined, tmdbId: number) {
    const request = await this.ombiApi.getMovieRequest(tmdbId);
    // The sweep failed: skip so the comparator protects the item.
    if (request === undefined) {
      return undefined;
    }

    switch (name) {
      case 'addUser': {
        const username = request && resolveOmbiRequester(request);
        return username ? [username] : [];
      }
      case 'requestDate':
        return request ? requestedAt(request) : null;
      case 'releaseDate':
        return ombiDate(request?.releaseDate);
      case 'approvalDate':
        return request ? approvedAt(request) : null;
      case 'mediaAddedAt':
        return request?.available ? ombiDate(request.markedAsAvailable) : null;
      case 'amountRequested':
        // Ombi holds one request per movie, whoever asks after the first.
        return request ? 1 : 0;
      case 'isRequested':
        return request ? 1 : 0;
      default:
        return null;
    }
  }

  private async getShowValue(
    name: string | undefined,
    tmdbId: number,
    dataType: MediaItemType | undefined,
    origLibItem: MediaItem | undefined,
  ) {
    const show = await this.ombiApi.getShowRequest(tmdbId);
    if (show === undefined) {
      return undefined;
    }

    const seasonScoped = dataType === 'season' || dataType === 'episode';
    const seasonNumber =
      dataType === 'season'
        ? origLibItem.index
        : dataType === 'episode'
          ? origLibItem.parentIndex
          : undefined;
    const children = (
      seasonScoped
        ? seasonNumber == null
          ? []
          : childRequestsForSeason(show, seasonNumber)
        : childRequestsForSeason(show)
    ).sort(
      (a, b) =>
        new Date(a.requestedDate).getTime() -
        new Date(b.requestedDate).getTime(),
    );

    switch (name) {
      case 'addUser':
        return [
          ...new Set(
            children
              .map(resolveOmbiRequester)
              .filter((username): username is string => !!username),
          ),
        ];
      case 'requestDate':
        return children[0] ? requestedAt(children[0]) : null;
      case 'releaseDate':
        return seasonScoped
          ? this.getAirDate(children, seasonNumber, dataType, origLibItem)
          : ombiDate(show?.releaseDate);
      case 'approvalDate':
        return earliest(children.map(approvedAt));
      case 'mediaAddedAt':
        return earliest(
          children
            .filter((child) => child.available)
            .map((child) => ombiDate(child.markedAsAvailable)),
        );
      case 'amountRequested':
        return children.length;
      case 'isRequested':
        return children.length > 0 ? 1 : 0;
      default:
        return null;
    }
  }

  /**
   * Ombi stores an air date per requested episode only, so a season answers
   * with its earliest requested episode and an episode with its own.
   */
  private getAirDate(
    children: OmbiChildRequest[],
    seasonNumber: number | undefined,
    dataType: MediaItemType,
    origLibItem: MediaItem,
  ): Date | null {
    const episodes = children
      .flatMap((child) => child.seasonRequests)
      .filter((season) => season.seasonNumber === seasonNumber)
      .flatMap((season) => season.episodes);

    return earliest(
      (dataType === 'episode'
        ? episodes.filter((ep) => ep.episodeNumber === origLibItem.index)
        : episodes
      ).map((ep) => ombiDate(ep.airDate)),
    );
  }
}
