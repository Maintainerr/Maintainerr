import { Injectable } from '@nestjs/common';
import { MediaServerFactory } from '../api/media-server/media-server.factory';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';

@Injectable()
export class MediaIdFinder {
  constructor(
    private mediaServerFactory: MediaServerFactory,
    private tmdbApi: TmdbApiService,
    private tmdbIdHelper: TmdbIdService,
  ) {}

  public async findTvdbId(plexId: string | number, tmdbId?: number | null) {
    let tvdbid = undefined;
    if (!tmdbId && plexId) {
      tmdbId = (
        await this.tmdbIdHelper.getTmdbIdFromPlexRatingKey(plexId.toString())
      )?.id;
    }

    const tmdbShow = tmdbId
      ? await this.tmdbApi.getTvShow({ tvId: tmdbId })
      : undefined;

    if (!tmdbShow?.external_ids?.tvdb_id) {
      const mediaServer = await this.mediaServerFactory.getService();
      let mediaData = await mediaServer.getMetadata(plexId.toString());
      // fetch correct record for seasons & episodes (go up to show level)
      mediaData = mediaData?.grandparentId
        ? await mediaServer.getMetadata(mediaData.grandparentId)
        : mediaData?.parentId
          ? await mediaServer.getMetadata(mediaData.parentId)
          : mediaData;

      // Check providerIds for tvdb
      const tvdbFromProviders = mediaData?.providerIds?.tvdb;
      if (tvdbFromProviders) {
        tvdbid = tvdbFromProviders;
      }
    } else {
      tvdbid = tmdbShow.external_ids.tvdb_id;
    }

    return tvdbid;
  }
}
