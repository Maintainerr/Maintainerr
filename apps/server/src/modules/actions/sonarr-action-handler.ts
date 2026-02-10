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
import { MetadataService } from '../metadata/metadata.service';
import {
  findMetadataLookupMatch,
  formatMetadataLookupCandidates,
} from '../metadata/metadata-lookup.util';

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
        if (
          collection.type === 'season' ||
          collection.type === 'episode'
        ) {
          this.logger.warn(
            `[Sonarr] CHANGE_QUALITY_PROFILE is not supported for type: ${collection.type}. Quality profiles can only be changed for entire shows.`,
          );
          break;
        }

        const targetProfileId = collection.sonarrQualityProfileId;

        if (!targetProfileId) {
          this.logger.warn(
            `No target quality profile configured for collection ${collection.title}`,
          );
          break;
        }

        if (!Number.isInteger(targetProfileId) || targetProfileId <= 0) {
          this.logger.warn(
            `[Sonarr] Invalid quality profile ID (${targetProfileId}) for collection ${collection.title}`,
          );
          break;
        }

        sonarrMedia.qualityProfileId = targetProfileId;
        await sonarrApiClient.updateSeries(sonarrMedia);

        this.logger.log(
          `[Sonarr] Changed quality profile for show '${sonarrMedia.title}' to profile ID ${targetProfileId}`,
        );

        try {
          await sonarrApiClient.searchSeries(sonarrMedia.id);
          this.logger.log(
            `[Sonarr] Triggered search for show '${sonarrMedia.title}'`,
          );
        } catch (error) {
          this.logger.warn(
            `[Sonarr] Failed to trigger search for show '${sonarrMedia.title}': ${error.message}`,
          );
        }
        break;
      }
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
