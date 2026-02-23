import { Injectable } from '@nestjs/common';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import { MetadataDetails } from '../interfaces/metadata.types';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

@Injectable()
export class TmdbMetadataProvider implements IMetadataProvider {
  readonly name = 'TMDB';

  constructor(private readonly tmdbApi: TmdbApiService) {}

  isAvailable(): boolean {
    return true; // TMDB always available (has a default key)
  }

  extractId(ids: { tmdbId?: number }): number | undefined {
    return ids.tmdbId;
  }

  async getMovieDetails(tmdbId: number): Promise<MetadataDetails | undefined> {
    const movie = await this.tmdbApi.getMovie({ movieId: tmdbId });
    if (!movie) return undefined;

    return {
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterUrl: movie.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}`
        : undefined,
      backdropUrl: movie.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w1280${movie.backdrop_path}`
        : undefined,
      externalIds: {
        tmdbId: movie.id,
        tvdbId: movie.external_ids?.tvdb_id ?? undefined,
        imdbId: movie.external_ids?.imdb_id ?? movie.imdb_id ?? undefined,
        type: 'movie',
      },
      type: 'movie',
    };
  }

  async getTvShowDetails(
    tmdbId: number,
  ): Promise<MetadataDetails | undefined> {
    const show = await this.tmdbApi.getTvShow({ tvId: tmdbId });
    if (!show) return undefined;

    return {
      id: show.id,
      title: show.name,
      overview: show.overview,
      posterUrl: show.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${show.poster_path}`
        : undefined,
      backdropUrl: show.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w1280${show.backdrop_path}`
        : undefined,
      externalIds: {
        tmdbId: show.id,
        tvdbId: show.external_ids?.tvdb_id ?? undefined,
        imdbId: show.external_ids?.imdb_id ?? undefined,
        type: 'tv',
      },
      type: 'tv',
    };
  }

  async getPosterUrl(
    tmdbId: number,
    type: 'movie' | 'tv',
    sizeHint = 'w500',
  ): Promise<string | undefined> {
    const path =
      type === 'movie'
        ? (await this.tmdbApi.getMovie({ movieId: tmdbId }))?.poster_path
        : (await this.tmdbApi.getTvShow({ tvId: tmdbId }))?.poster_path;
    return path ? `${TMDB_IMAGE_BASE}/${sizeHint}${path}` : undefined;
  }

  async getBackdropUrl(
    tmdbId: number,
    type: 'movie' | 'tv',
    sizeHint = 'w1280',
  ): Promise<string | undefined> {
    const path =
      type === 'movie'
        ? (await this.tmdbApi.getMovie({ movieId: tmdbId }))?.backdrop_path
        : (await this.tmdbApi.getTvShow({ tvId: tmdbId }))?.backdrop_path;
    return path ? `${TMDB_IMAGE_BASE}/${sizeHint}${path}` : undefined;
  }

  // ───── Provider-specific methods (not part of IMetadataProvider) ─────

  /**
   * Look up TMDB entries by an external ID (IMDB or TVDB).
   * Used by MetadataService for cross-provider ID resolution.
   */
  async findByExternalId(
    ...args: Parameters<TmdbApiService['getByExternalId']>
  ) {
    return this.tmdbApi.getByExternalId(...args);
  }
}
