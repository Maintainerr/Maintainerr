import { Injectable } from '@nestjs/common';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  PersonDetails,
  ProviderIds,
} from '../interfaces/metadata.types';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

@Injectable()
export class TmdbMetadataProvider implements IMetadataProvider {
  readonly name = 'TMDB';
  readonly idKey = 'tmdb';

  constructor(private readonly tmdbApi: TmdbApiService) {}

  isAvailable(): boolean {
    return true;
  }

  extractId(ids: ProviderIds): number | undefined {
    const value = ids[this.idKey];
    return typeof value === 'number' ? value : undefined;
  }

  assignId(ids: ProviderIds, id: number): void {
    ids[this.idKey] = id;
  }

  private buildImageUrl(
    path: string | undefined | null,
    size: string,
  ): string | undefined {
    return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : undefined;
  }

  private getRecord(tmdbId: number, type: 'movie' | 'tv') {
    return type === 'movie'
      ? this.tmdbApi.getMovie({ movieId: tmdbId })
      : this.tmdbApi.getTvShow({ tvId: tmdbId });
  }

  private parseYear(value?: string): number | undefined {
    if (!value || value.length < 4) {
      return undefined;
    }

    const year = Number.parseInt(value.slice(0, 4), 10);
    return Number.isFinite(year) ? year : undefined;
  }

  async getDetails(
    tmdbId: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    const record = await this.getRecord(tmdbId, type);
    if (!record) {
      return undefined;
    }

    return {
      id: record.id,
      title: 'title' in record ? record.title : record.name,
      year: this.parseYear(
        'release_date' in record ? record.release_date : record.first_air_date,
      ),
      overview: record.overview,
      posterUrl: this.buildImageUrl(record.poster_path, 'w500'),
      backdropUrl: this.buildImageUrl(record.backdrop_path, 'w1280'),
      rating: record.vote_average || undefined,
      externalIds: {
        tmdb: record.id,
        tvdb: record.external_ids?.tvdb_id ?? undefined,
        imdb:
          record.external_ids?.imdb_id ??
          ('imdb_id' in record ? record.imdb_id : undefined) ??
          undefined,
        type,
      },
      type,
    };
  }

  async getPosterUrl(
    tmdbId: number,
    type: 'movie' | 'tv',
    sizeHint = 'w500',
  ): Promise<string | undefined> {
    const record = await this.getRecord(tmdbId, type);
    return this.buildImageUrl(record?.poster_path, sizeHint);
  }

  async getBackdropUrl(
    tmdbId: number,
    type: 'movie' | 'tv',
    sizeHint = 'w1280',
  ): Promise<string | undefined> {
    const record = await this.getRecord(tmdbId, type);
    return this.buildImageUrl(record?.backdrop_path, sizeHint);
  }

  async getPersonDetails(
    tmdbPersonId: number,
  ): Promise<PersonDetails | undefined> {
    const person = await this.tmdbApi.getPerson({ personId: tmdbPersonId });
    if (!person) {
      return undefined;
    }

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
    type: string,
  ): Promise<ExternalIdSearchResult[] | undefined> {
    if (type === 'tmdb') {
      return undefined;
    }

    const response = await this.tmdbApi.getByExternalId({
      externalId: type === 'imdb' ? String(externalId) : Number(externalId),
      type,
    } as Parameters<TmdbApiService['getByExternalId']>[0]);

    if (!response) {
      return undefined;
    }

    const results: ExternalIdSearchResult[] = [];
    for (const movie of response.movie_results || []) {
      if (movie.id) {
        results.push({ movieId: movie.id });
      }
    }

    for (const show of response.tv_results || []) {
      if (show.id) {
        results.push({ tvShowId: show.id });
      }
    }

    return results.length > 0 ? results : undefined;
  }
}
