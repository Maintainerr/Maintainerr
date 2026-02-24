import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { ServarrService } from '../api/servarr-api/servarr.service';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { ServarrAction } from '../collections/interfaces/collection.interface';
import { MaintainerrLogger } from '../logging/logs.service';
import { MetadataService } from '../metadata/metadata.service';

@Injectable()
export class SonarrActionHandler {
  constructor(
    private readonly servarrApi: ServarrService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly metadataService: MetadataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(SonarrActionHandler.name);
  }

  public async handleAction(
    collection: Collection,
    media: CollectionMedia,
  ): Promise<void> {
    const mediaServer = await this.mediaServerFactory.getService();
    const sonarrApiClient = await this.servarrApi.getSonarrApiClient(
      collection.sonarrSettingsId,
    );

    // Fetch media data for index info (needed for season/episode actions)
    let mediaData: MediaItem | undefined = undefined;
    if (['season', 'episode'].includes(collection.type)) {
      mediaData = await mediaServer.getMetadata(media.mediaServerId);
    }

    // resolveIds() handles the hierarchy walk (episode→season→show) internally
    const ids = await this.metadataService.resolveIds(media.mediaServerId);
    const tvdbId = ids?.tvdbId ?? media.tvdbId;
    const tmdbId = ids?.tmdbId ?? media.tmdbId;

    if (!tvdbId) {
      this.logger.log(
        `Couldn't find correct TVDB ID for media server item ${media.mediaServerId}${tmdbId ? ` (TMDB: ${tmdbId})` : ''}. No action was taken. Please check this show manually`,
      );
      return;
    }

    let sonarrMedia = await sonarrApiClient.getSeriesByTvdbId(tvdbId);

    if (!sonarrMedia?.id) {
      if (collection.arrAction !== ServarrAction.UNMONITOR) {
        this.logger.log(
          `Couldn't find show with TVDB ID ${tvdbId} in Sonarr for media server item ${media.mediaServerId}. Attempting to remove from the filesystem via media server.`,
        );
        await mediaServer.deleteFromDisk(media.mediaServerId);
      } else {
        this.logger.log(
          `Couldn't find show with TVDB ID ${tvdbId} in Sonarr for media server item ${media.mediaServerId}. No unmonitor action was taken.`,
        );
      }
      return;
    }

    switch (collection.arrAction) {
      case ServarrAction.DELETE:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
            );
            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          case 'episode':
            await sonarrApiClient.UnmonitorDeleteEpisodes(
              sonarrMedia.id,
              mediaData?.parentIndex,
              [mediaData?.index],
              true,
            );
            this.logger.log(
              `[Sonarr] Removed season ${mediaData?.parentIndex} episode ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          default:
            await sonarrApiClient.deleteShow(
              sonarrMedia.id,
              true,
              collection.listExclusions,
            );
            this.logger.log(`Removed show '${sonarrMedia.title}' from Sonarr`);
            break;
        }
        break;
      case ServarrAction.UNMONITOR:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              false,
            );
            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          case 'episode':
            await sonarrApiClient.UnmonitorDeleteEpisodes(
              sonarrMedia.id,
              mediaData?.parentIndex,
              [mediaData?.index],
              false,
            );
            this.logger.log(
              `[Sonarr] Unmonitored season ${mediaData?.parentIndex} episode ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          default:
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              false,
            );

            if (sonarrMedia) {
              // unmonitor show
              sonarrMedia.monitored = false;
              await sonarrApiClient.updateSeries(sonarrMedia);
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}'`,
              );
            }

            break;
        }
        break;
      case ServarrAction.UNMONITOR_DELETE_ALL:
        switch (collection.type) {
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'all',
              true,
            );

            if (sonarrMedia) {
              // unmonitor show
              sonarrMedia.monitored = false;
              await sonarrApiClient.updateSeries(sonarrMedia);
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed all episodes`,
              );
            }

            break;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_ALL is not supported for type: ${collection.type}`,
            );
            break;
        }
        break;
      case ServarrAction.UNMONITOR_DELETE_EXISTING:
        switch (collection.type) {
          case 'season':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              mediaData?.index,
              true,
              true,
            );
            this.logger.log(
              `[Sonarr] Removed existing episodes from season ${mediaData?.index} from show '${sonarrMedia.title}'`,
            );
            break;
          case 'show':
            sonarrMedia = await sonarrApiClient.unmonitorSeasons(
              sonarrMedia.id,
              'existing',
              true,
            );

            if (sonarrMedia) {
              // unmonitor show
              sonarrMedia.monitored = false;
              await sonarrApiClient.updateSeries(sonarrMedia);
              this.logger.log(
                `[Sonarr] Unmonitored show '${sonarrMedia.title}' and removed existing episodes`,
              );
            }

            break;
          default:
            this.logger.warn(
              `[Sonarr] UNMONITOR_DELETE_EXISTING is not supported for type: ${collection.type}`,
            );
            break;
        }
        break;
    }
  }
}
