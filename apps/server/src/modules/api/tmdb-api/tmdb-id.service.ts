import { EMediaDataType, MediaItem } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../media-server/media-server.factory';
import { PlexMetadata } from '../../../modules/api/plex-api/interfaces/media.interface';
import { TmdbApiService } from '../../../modules/api/tmdb-api/tmdb.service';
import { MaintainerrLogger } from '../../logging/logs.service';
import { PlexLibraryItem } from '../plex-api/interfaces/library.interfaces';

@Injectable()
export class TmdbIdService {
  constructor(
    private readonly tmdbApi: TmdbApiService,
    private readonly mediaServerFactory: MediaServerFactory,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(TmdbIdService.name);
  }

  async getTmdbIdFromPlexRatingKey(
    ratingKey: string,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined }> {
    try {
      const mediaServer = await this.mediaServerFactory.getService();
      let mediaItem = await mediaServer.getMetadata(ratingKey);
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
          `Failed to fetch metadata of media server item : ${ratingKey}`,
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

      // Use providerIds from the abstraction layer
      if (item.providerIds) {
        if (item.providerIds.tmdb) {
          id = +item.providerIds.tmdb;
        }

        if (!id && item.providerIds.tvdb) {
          const resp = await this.tmdbApi.getByExternalId({
            externalId: +item.providerIds.tvdb,
            type: 'tvdb',
          });

          if (resp) {
            id =
              resp.movie_results?.length > 0
                ? resp.movie_results[0]?.id
                : resp.tv_results[0]?.id;
          }
        }

        if (!id && item.providerIds.imdb) {
          const resp = await this.tmdbApi.getByExternalId({
            externalId: item.providerIds.imdb,
            type: 'imdb',
          });

          if (resp) {
            id =
              resp.movie_results?.length > 0
                ? resp.movie_results[0]?.id
                : resp.tv_results[0]?.id;
          }
        }
      }
      return {
        type: [
          EMediaDataType.SHOWS,
          EMediaDataType.SEASONS,
          EMediaDataType.EPISODES,
        ].includes(item.type)
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

  /**
   * @deprecated Use getTmdbIdFromMediaItem instead. This method is kept for backward compatibility with Plex-specific code.
   */
  async getTmdbIdFromPlexData(
    libItem: PlexMetadata | PlexLibraryItem,
  ): Promise<{ type: 'movie' | 'tv'; id: number | undefined }> {
    try {
      let id: number = undefined;

      if (libItem.Guid) {
        if (libItem.Guid.find((el) => el.id.includes('tmdb'))) {
          id = +libItem.Guid.find((el) => el.id.includes('tmdb')).id.split(
            '://',
          )[1];
        }

        if (!id && libItem.Guid.find((el) => el.id.includes('tvdb'))) {
          const resp = await this.tmdbApi.getByExternalId({
            externalId: +libItem.Guid.find((el) => el.id.includes('tvdb'))
              ?.id.split('://')[1]
              ?.split('?')[0],
            type: 'tvdb',
          });

          if (resp) {
            id =
              resp.movie_results?.length > 0
                ? resp.movie_results[0]?.id
                : resp.tv_results[0]?.id;
          }
        }

        if (!id && libItem.Guid.find((el) => el.id.includes('imdb'))) {
          const resp = await this.tmdbApi.getByExternalId({
            externalId: libItem.Guid.find((el) => el.id.includes('imdb'))
              ?.id.split('://')[1]
              ?.split('?')[0],
            type: 'imdb',
          });

          if (resp) {
            id =
              resp.movie_results?.length > 0
                ? resp.movie_results[0]?.id
                : resp.tv_results[0]?.id;
          }
        }
      }
      return {
        type: ['show', 'season', 'episode'].includes(libItem.type)
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
