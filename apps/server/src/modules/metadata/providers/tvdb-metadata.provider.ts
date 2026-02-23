import { Injectable } from '@nestjs/common';
import { TvdbApiService } from '../../api/tvdb-api/tvdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import { MetadataDetails } from '../interfaces/metadata.types';

@Injectable()
export class TvdbMetadataProvider implements IMetadataProvider {
  readonly name = 'TVDB';

  constructor(private readonly tvdbApi: TvdbApiService) {}

  isAvailable(): boolean {
    return this.tvdbApi.isAvailable();
  }

  extractId(ids: { tvdbId?: number }): number | undefined {
    return ids.tvdbId;
  }

  async getMovieDetails(tvdbId: number): Promise<MetadataDetails | undefined> {
    const movie = await this.tvdbApi.getMovie(tvdbId);
    if (!movie) return undefined;

    return {
      id: movie.id,
      title: movie.name,
      overview: movie.overview ?? undefined,
      posterUrl: this.tvdbApi.getPosterUrl(movie),
      backdropUrl: this.tvdbApi.getBackdropUrl(movie),
      externalIds: {
        tvdbId: movie.id,
        imdbId: this.tvdbApi.getImdbId(movie),
        type: 'movie',
      },
      type: 'movie',
    };
  }

  async getTvShowDetails(
    tvdbId: number,
  ): Promise<MetadataDetails | undefined> {
    const series = await this.tvdbApi.getSeries(tvdbId);
    if (!series) return undefined;

    return {
      id: series.id,
      title: series.name,
      overview: series.overview ?? undefined,
      posterUrl: this.tvdbApi.getPosterUrl(series),
      backdropUrl: this.tvdbApi.getBackdropUrl(series),
      externalIds: {
        tvdbId: series.id,
        imdbId: this.tvdbApi.getImdbId(series),
        type: 'tv',
      },
      type: 'tv',
    };
  }

  async getPosterUrl(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<string | undefined> {
    const record =
      type === 'movie'
        ? await this.tvdbApi.getMovie(tvdbId)
        : await this.tvdbApi.getSeries(tvdbId);
    return this.tvdbApi.getPosterUrl(record);
  }

  async getBackdropUrl(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<string | undefined> {
    const record =
      type === 'movie'
        ? await this.tvdbApi.getMovie(tvdbId)
        : await this.tvdbApi.getSeries(tvdbId);
    return this.tvdbApi.getBackdropUrl(record);
  }

  // ───── Provider-specific methods (not part of IMetadataProvider) ─────

  /**
   * Search TVDB by a remote ID (e.g. IMDB ID).
   * Used by MetadataService for cross-provider ID resolution.
   */
  async searchByRemoteId(remoteId: string) {
    return this.tvdbApi.searchByRemoteId(remoteId);
  }
}
