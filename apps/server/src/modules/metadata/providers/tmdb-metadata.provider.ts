import { Injectable } from '@nestjs/common';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  PersonDetails,
} from '../interfaces/metadata.types';

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

  private buildImageUrl(
    path: string | undefined | null,
    size: string,
  ): string | undefined {
    return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : undefined;
  }

  async getMovieDetails(tmdbId: number): Promise<MetadataDetails | undefined> {
    const movie = await this.tmdbApi.getMovie({ movieId: tmdbId });
    if (!movie) return undefined;

    return {
      id: movie.id,
      title: movie.title,
      overview: movie.overview,
      posterUrl: this.buildImageUrl(movie.poster_path, 'w500'),
      backdropUrl: this.buildImageUrl(movie.backdrop_path, 'w1280'),
      externalIds: {
        tmdbId: movie.id,
        tvdbId: movie.external_ids?.tvdb_id ?? undefined,
        imdbId: movie.external_ids?.imdb_id ?? movie.imdb_id ?? undefined,
        type: 'movie',
      },
      type: 'movie',
    };
  }

  async getTvShowDetails(tmdbId: number): Promise<MetadataDetails | undefined> {
    const show = await this.tmdbApi.getTvShow({ tvId: tmdbId });
    if (!show) return undefined;

    return {
      id: show.id,
      title: show.name,
      overview: show.overview,
      posterUrl: this.buildImageUrl(show.poster_path, 'w500'),
      backdropUrl: this.buildImageUrl(show.backdrop_path, 'w1280'),
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
    return this.buildImageUrl(path, sizeHint);
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
    return this.buildImageUrl(path, sizeHint);
  }

  async getPersonDetails(
    tmdbPersonId: number,
  ): Promise<PersonDetails | undefined> {
    const person = await this.tmdbApi.getPerson({ personId: tmdbPersonId });
    if (!person) return undefined;

    return {
      id: person.id,
      name: person.name,
      biography: person.biography || undefined,
      birthday: person.birthday || undefined,
      deathday: person.deathday || undefined,
      knownForDepartment: person.known_for_department || undefined,
      profileUrl: this.buildImageUrl(person.profile_path, 'w500'),
      imdbId: person.imdb_id,
    };
  }

  async findByExternalId(
    externalId: string | number,
    type: 'imdb' | 'tvdb' | 'tmdb',
  ): Promise<ExternalIdSearchResult[] | undefined> {
    if (type === 'tmdb') return undefined; // Can't search TMDB by its own IDs

    const resp = await this.tmdbApi.getByExternalId({
      externalId: type === 'imdb' ? String(externalId) : Number(externalId),
      type,
    } as Parameters<TmdbApiService['getByExternalId']>[0]);

    if (!resp) return undefined;

    const results: ExternalIdSearchResult[] = [];
    for (const m of resp.movie_results || []) {
      if (m.id) results.push({ movieId: m.id });
    }
    for (const t of resp.tv_results || []) {
      if (t.id) results.push({ tvShowId: t.id });
    }
    return results.length > 0 ? results : undefined;
  }
}
