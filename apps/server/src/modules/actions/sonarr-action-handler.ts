import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { SeerrApiService } from '../api/seerr-api/seerr-api.service';
import { SonarrSeries } from '../api/servarr-api/interfaces/sonarr.interface';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import {
  findMetadataLookupMatch,
  formatMetadataLookupCandidates,
} from '../metadata/metadata-lookup.util';
import { MetadataService } from '../metadata/metadata.service';

@Injectable()
export class SonarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly seerrApi: SeerrApiService,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SonarrActionHandler.name);
  }

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<boolean> {
    const mediaServer = await this.mediaServerFactory.getService();
    const sonarrApiClient = await this.servarrApi.getSonarrApiClient(
      collection.sonarrSettingsId,
    );

    let mediaData: MediaItem | undefined = undefined;

    if (['season', 'episode'].includes(collection.type)) {
      mediaData = await mediaServer.getMetadata(media.mediaServerId);
    }

    const lookupCandidates =
      await this.metadataService.resolveLookupCandidatesForService(
        media.mediaServerId,
        'sonarr',
        {
          tvdb: media.tvdbId,
          tmdb: media.tmdbId,
        },
      );

    if (lookupCandidates.length === 0) {
      this.logger.log(
        `Couldn't resolve any supported external IDs for media server item ${media.mediaServerId}. No action was taken. Please check this show manually.`,
      );
      return false;
    }

    const matchedResult = await findMetadataLookupMatch(lookupCandidates, {
      tvdb: (id) => sonarrApiClient.getSeriesByTvdbId(id),
    });
    let sonarrMedia = matchedResult?.result;

    if (!sonarrMedia?.id) {
      const attemptedIds = formatMetadataLookupCandidates(lookupCandidates);

      if (collection.arrAction === ServarrAction.CHANGE_QUALITY_PROFILE) {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. No quality profile change was applied.`,
        );
        return false;
      }

      if (
        collection.arrAction !== ServarrAction.UNMONITOR &&
        collection.arrAction !== ServarrAction.UNMONITOR_SHOW_IF_EMPTY
      ) {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
        return true;
      } else {
        this.logger.log(
          `Couldn't find show in Sonarr using resolved external IDs [${attemptedIds}] for media server item ${media.mediaServerId}. No unmonitor action was taken.`,
        );
        return false;
      }
    }

    switch (collection.arrAction) {
      case ServarrAction.DELETE_SHOW_IF_EMPTY:
        if (collection.type !== 'season') {
          this.logger.warn(
            `[Sonarr] DELETE_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
          );
          break;
        }
        sonarrMedia = await sonarrApiClient.unmonitorSeasons(
          sonarrMedia.id,
          mediaData?.index,
          true,
        );

        if (!sonarrMedia) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
        );
        await this.deleteShowIfEmpty(
          sonarrApiClient,
          matchedResult.candidate,
          media.tmdbId,
          mediaData?.index,
          collection.listExclusions,
        );
        return true;
      case ServarrAction.DELETE:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          case 'episode': {
            const episodeLookup = this.getEpisodeLookup(mediaData);

            if (!episodeLookup) {
              this.logger.warn(
                `[Sonarr] Couldn't identify episode '${mediaData?.title ?? media.mediaServerId}' for show '${sonarrMedia.title}'. No delete action was taken.`,
              );
              return false;
            }

            if (
              !(await sonarrApiClient.UnmonitorDeleteEpisodes(
                sonarrMedia.id,
                episodeLookup.seasonNumber,
                episodeLookup.episodeNumbers,
                true,
                episodeLookup.airDate,
              ))
            ) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.parentIndex} ${this.getEpisodeLogLabel(mediaData)} from show '${sonarrMedia.title}'`,
            );
            return true;
          }
          default:
            if (
              !(await sonarrApiClient.deleteShow(
                sonarrMedia.id,
                true,
                collection.listExclusions,
              ))
            ) {
              return false;
            }
            this.logger.log(`Removed show '${sonarrMedia.title}' from Sonarr`);
            return true;
        }
        break;
      case ServarrAction.UNMONITOR_SHOW_IF_EMPTY:
        if (collection.type !== 'season') {
          this.logger.warn(
            `[Sonarr] UNMONITOR_SHOW_IF_EMPTY is only supported for type: season, got: ${collection.type}`,
          );
          break;
        }
        sonarrMedia = await sonarrApiClient.unmonitorSeasons(
          sonarrMedia.id,
          mediaData?.index,
          false,
        );

        if (!sonarrMedia) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
        );
        await this.unmonitorShowIfEmptyAndEnded(
          sonarrApiClient,
          matchedResult.candidate,
        );
        return true;
      case ServarrAction.UNMONITOR:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              false,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          case 'episode': {
            const episodeLookup = this.getEpisodeLookup(mediaData);

            if (!episodeLookup) {
              this.logger.warn(
                `[Sonarr] Couldn't identify episode '${mediaData?.title ?? media.mediaServerId}' for show '${sonarrMedia.title}'. No unmonitor action was taken.`,
              );
              return false;
            }

            if (
              !(await sonarrApiClient.UnmonitorDeleteEpisodes(
                sonarrMedia.id,
                episodeLookup.seasonNumber,
                episodeLookup.episodeNumbers,
                false,
                episodeLookup.airDate,
              ))
            ) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.parentIndex} ${this.getEpisodeLogLabel(mediaData)} from show '${sonarrMedia.title}'`,
            );
            return true;
          }
          default:
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              false,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}'`,
              );
              return true;
            }

            return false;
        }
      case ServarrAction.UNMONITOR_DELETE_ALL:
        switch (collection.type) {
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              true,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed all episodes`,
              );
              return true;
            }

            return false;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_ALL is not supported for type: ${collection.type}`,
            );
            return false;
        }
      case ServarrAction.UNMONITOR_DELETE_EXISTING:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
              true,
            );

            if (!sonarrMedia) {
              return false;
            }

            this.logger.log(
              `[Sonarr] Removed existing episodes from season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            return true;
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'existing',
              true,
            );

            if (sonarrMedia) {
              sonarrMedia.monitored = false;
              if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
                return false;
              }
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed existing episodes`,
              );
              return true;
            }

            return false;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_EXISTING is not supported for type: ${collection.type}`,
            );
            return false;
        }
        break;
      case ServarrAction.CHANGE_QUALITY_PROFILE: {
        if (collection.type === 'season' || collection.type === 'episode') {
          this.logger.warn(
            `[Sonarr] CHANGE_QUALITY_PROFILE is not supported for type: ${collection.type}. Quality profiles can only be changed for entire shows.`,
          );
          return false;
        }

        const targetProfileId = collection.sonarrQualityProfileId;

        if (!targetProfileId) {
          this.logger.warn(
            `No target quality profile configured for collection ${collection.title}`,
          );
          return false;
        }

        if (!Number.isInteger(targetProfileId) || targetProfileId <= 0) {
          this.logger.warn(
            `[Sonarr] Invalid quality profile ID (${targetProfileId}) for collection ${collection.title}`,
          );
          return false;
        }

        if (sonarrMedia.qualityProfileId === targetProfileId) {
          return true;
        }

        sonarrMedia.qualityProfileId = targetProfileId;
        if (!(await sonarrApiClient.updateSeries(sonarrMedia))) {
          return false;
        }

        this.logger.log(
          `[Sonarr] Changed quality profile for show '${sonarrMedia.title}' to profile ID ${targetProfileId}`,
        );

        await sonarrApiClient.searchSeries(sonarrMedia.id);
        return true;
      }
    }

    return false;
  }

  private getEpisodeLookup(mediaData?: MediaItem):
    | {
        seasonNumber: number;
        episodeNumbers: number[];
        airDate?: Date;
      }
    | undefined {
    if (mediaData?.parentIndex === undefined) {
      return undefined;
    }

    if (mediaData.index !== undefined) {
      return {
        seasonNumber: mediaData.parentIndex,
        episodeNumbers: [mediaData.index],
      };
    }

    if (mediaData.originallyAvailableAt) {
      return {
        seasonNumber: mediaData.parentIndex,
        episodeNumbers: [],
        airDate: mediaData.originallyAvailableAt,
      };
    }

    return undefined;
  }

  private getEpisodeLogLabel(mediaData?: MediaItem): string {
    if (mediaData?.index !== undefined) {
      return `episode ${mediaData.index}`;
    }

    if (mediaData?.originallyAvailableAt) {
      return `episode airing ${
        mediaData.originallyAvailableAt.toISOString().split('T')[0]
      }`;
    }

    return 'episode';
  }

  private async deleteShowIfEmpty(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
    tmdbId: number | undefined,
    removedSeasonNumber: number | undefined,
    listExclusions: boolean | undefined,
  ): Promise<void> {
    const series = await this.refetchSeries(sonarrApiClient, lookupCandidate);

    if (!series?.id) {
      this.logger.debug(
        `[Sonarr] Skipping empty-show cleanup: series refetch returned no result for ${lookupCandidate.providerKey} id ${lookupCandidate.id}`,
      );
      return;
    }

    if (!this.isShowEmpty(series, 'files')) {
      this.logger.debug(
        `[Sonarr] Show '${series.title}' still has ${series.statistics?.episodeFileCount ?? 0} episode file(s) - skipping show deletion`,
      );
      return;
    }

    const hasSeerrCheckInputs =
      tmdbId !== undefined && removedSeasonNumber !== undefined;

    if (this.seerrApi.isConfigured() && hasSeerrCheckInputs) {
      const hasRemainingRequests =
        await this.seerrApi.hasRemainingSeasonRequests(
          tmdbId,
          removedSeasonNumber,
        );

      if (hasRemainingRequests === true) {
        this.logger.debug(
          `[Sonarr] Show '${series.title}' has other active Seerr season requests - skipping show deletion`,
        );
        return;
      }

      if (hasRemainingRequests === undefined) {
        this.logger.debug(
          `[Sonarr] Show '${series.title}' Seerr state could not be determined - skipping show deletion`,
        );
        return;
      }

      await sonarrApiClient.deleteShow(series.id, true, listExclusions);
      this.logger.log(
        `[Sonarr] Show '${series.title}' has no files and no remaining Seerr season requests - deleted from Sonarr`,
      );
      return;
    }

    if (!this.isShowEmptyAndEnded(series, 'monitored')) {
      this.logger.debug(
        `[Sonarr] Show '${series.title}' is not ended with all seasons unmonitored (status=${series.status}) - skipping show deletion`,
      );
      return;
    }

    await sonarrApiClient.deleteShow(series.id, true, listExclusions);
    this.logger.log(
      `[Sonarr] Show '${series.title}' is ended with no files or monitored seasons remaining - deleted from Sonarr`,
    );
  }

  private async unmonitorShowIfEmptyAndEnded(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
  ): Promise<void> {
    const series = await this.refetchSeries(sonarrApiClient, lookupCandidate);

    if (!series) {
      this.logger.debug(
        `[Sonarr] Skipping empty-show unmonitor: series refetch returned no result for ${lookupCandidate.providerKey} id ${lookupCandidate.id}`,
      );
      return;
    }

    if (!this.isShowEmptyAndEnded(series, 'monitored')) {
      this.logger.debug(
        `[Sonarr] Show '${series.title}' is not ended with all seasons unmonitored (status=${series.status}) - skipping show unmonitor`,
      );
      return;
    }

    series.monitored = false;
    await sonarrApiClient.updateSeries(series);
    this.logger.log(
      `[Sonarr] Show '${series.title}' is ended with no monitored seasons - unmonitored show`,
    );
  }

  private async refetchSeries(
    sonarrApiClient: Awaited<ReturnType<ServarrService['getSonarrApiClient']>>,
    lookupCandidate: { providerKey: string; id: number },
  ): Promise<SonarrSeries | undefined> {
    switch (lookupCandidate.providerKey) {
      case 'tvdb':
        return sonarrApiClient.getSeriesByTvdbId(lookupCandidate.id);
      default:
        return undefined;
    }
  }

  private isShowEmptyAndEnded(
    series: SonarrSeries,
    mode: 'files' | 'monitored',
  ): boolean {
    return series.status === 'ended' && this.isShowEmpty(series, mode);
  }

  private isShowEmpty(
    series: SonarrSeries,
    mode: 'files' | 'monitored',
  ): boolean {
    if (mode === 'files') {
      return (series.statistics?.episodeFileCount ?? 0) === 0;
    }

    return series.seasons.every((season) => !season.monitored);
  }
}
