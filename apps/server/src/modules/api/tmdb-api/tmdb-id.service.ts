import { MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { TmdbApiService } from '../../../modules/api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { MediaServerFactory } from '../media-server/media-server.factory';

@Injectable()
export class TmdbIdService {
  constructor(
    private readonly tmdbApi: TmdbApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TmdbIdService.name);
  }

  async getTmdbIdFromMediaServerId(
    mediaServerId: string,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined }> {
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      let mediaItem = await mediaServer.getMetadata(mediaServerId);
      if (mediaItem) {
        // fetch show in case of season / episode
        mediaItem = mediaItem.grandparentId
          ? await mediaServer.getMetadata(mediaItem.grandparentId)
          : mediaItem.parentId
            ? await mediaServer.getMetadata(mediaItem.parentId)
            : mediaItem;

        return this.getTmdbIdFromMediaItem(mediaItem);
      } else {
        this.logger.warn(
          `Failed to fetch metadata of media server item : ${mediaServerId}`,
        );
      }
    } catch (e) {
      this.logger.warn(`Failed to fetch id : ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }

  /**
   * Get TMDB ID from a MediaItem (server-agnostic)
   */
  async getTmdbIdFromMediaItem(
    item: MediaItem,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined }> {
    try {
      let id: number = undefined;

      if (item.providerIds) {
        for (const tmdbId of item.providerIds.tmdb || []) {
          id = +tmdbId;
          if (id) break;
        }

        if (!id) {
          for (const tvdbId of item.providerIds.tvdb || []) {
            const resp = await this.tmdbApi.getByExternalId({
              externalId: +tvdbId,
              type: 'tvdb',
            });

            if (resp) {
              id =
                resp.movie_results?.length > 0
                  ? resp.movie_results[0]?.id
                  : resp.tv_results[0]?.id;
              if (id) break;
            }
          }
        }

        if (!id) {
          for (const imdbId of item.providerIds.imdb || []) {
            const resp = await this.tmdbApi.getByExternalId({
              externalId: imdbId,
              type: 'imdb',
            });

            if (resp) {
              id =
                resp.movie_results?.length > 0
                  ? resp.movie_results[0]?.id
                  : resp.tv_results[0]?.id;
              if (id) break;
            }
          }
        }
      }
      return {
        type: ['show', 'season', 'episode'].includes(item.type)
          ? 'tv'
          : 'movie',
        id: id,
      };
    } catch (e) {
      this.logger.warn(`Failed to fetch id : ${e.message}`);
      this.logger.debug(e);
      return undefined;
    }
  }
}
