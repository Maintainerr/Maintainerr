import { Injectable } from '@nestjs/common';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import { TmdbIdService } from '../api/tmdb-api/tmdb-id.service';
import { TmdbApiService } from '../api/tmdb-api/tmdb.service';

@Injectable()
export class MediaIdFinder {
  constructor(
    private plexApi: PlexApiService,
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
      let plexData = await this.plexApi.getMetadata(plexId.toString());
      // fetch correct record for seasons & episodes
      plexData = plexData.grandparentRatingKey
        ? await this.plexApi.getMetadata(
            plexData.grandparentRatingKey.toString(),
          )
        : plexData.parentRatingKey
          ? await this.plexApi.getMetadata(plexData.parentRatingKey.toString())
          : plexData;

      const tvdbidPlex = plexData?.Guid?.find((el) => el.id.includes('tvdb'));
      if (tvdbidPlex) {
        tvdbid = tvdbidPlex.id.split('tvdb://')[1];
      }
    } else {
      tvdbid = tmdbShow.external_ids.tvdb_id;
    }

    return tvdbid;
  }
}
