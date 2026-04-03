import { Injectable } from '@nestjs/common';
import { TvdbApiService } from '../../api/tvdb-api/tvdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  PersonDetails,
  ProviderIds,
} from '../interfaces/metadata.types';

@Injectable()
export class TvdbMetadataProvider implements IMetadataProvider {
  readonly name = 'TVDB';
  readonly idKey = 'tvdb';

  constructor(private readonly tvdbApi: TvdbApiService) {}

  isAvailable(): boolean {
    return this.tvdbApi.isAvailable();
  }

  extractId(ids: ProviderIds): number | undefined {
    const value = ids[this.idKey];
    return typeof value === 'number' ? value : undefined;
  }

  assignId(ids: ProviderIds, id: number): void {
    ids[this.idKey] = id;
  }

  private getRecord(tvdbId: number, type: 'movie' | 'tv') {
    return type === 'movie'
      ? this.tvdbApi.getMovie(tvdbId)
      : this.tvdbApi.getSeries(tvdbId);
  }

  async getDetails(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    const record = await this.getRecord(tvdbId, type);
    if (!record) {
      return undefined;
    }

    return {
      id: record.id,
      title: record.name,
      overview: record.overview ?? undefined,
      posterUrl: this.tvdbApi.getPosterUrl(record, type),
      backdropUrl: this.tvdbApi.getBackdropUrl(record, type),
      rating: record.score || undefined,
      externalIds: {
        tmdb: this.tvdbApi.getTmdbId(record),
        tvdb: record.id,
        imdb: this.tvdbApi.getImdbId(record),
        type,
      },
      type,
    };
  }

  async getPosterUrl(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<string | undefined> {
    const record = await this.getRecord(tvdbId, type);
    return this.tvdbApi.getPosterUrl(record, type);
  }

  async getBackdropUrl(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<string | undefined> {
    const record = await this.getRecord(tvdbId, type);
    return this.tvdbApi.getBackdropUrl(record, type);
  }

  async getPersonDetails(
    tvdbPersonId: number,
  ): Promise<PersonDetails | undefined> {
    const person = await this.tvdbApi.getPerson(tvdbPersonId);
    if (!person) {
      return undefined;
    }

    const biography = person.biographies?.find(
      (entry) => entry.language === 'eng',
    )?.biography;
    const imdbRemote = person.remoteIds?.find(
      (remoteId) =>
        remoteId.sourceName === 'IMDB' || remoteId.id?.startsWith('nm'),
    );

    return {
      id: person.id,
      name: person.name,
      biography: biography || undefined,
      birthday: person.birth || undefined,
      deathday: person.death || undefined,
      profileUrl: person.image || undefined,
      imdbId: imdbRemote?.id,
    };
  }

  async findByExternalId(
    externalId: string | number,
    type: string,
  ): Promise<ExternalIdSearchResult[] | undefined> {
    if (type !== 'imdb') {
      return undefined;
    }

    const response = await this.tvdbApi.searchByRemoteId(String(externalId));
    if (!response?.length) {
      return undefined;
    }

    const results: ExternalIdSearchResult[] = [];
    for (const result of response) {
      if (result.series?.id) {
        results.push({ tvShowId: result.series.id });
      }

      if (result.movie?.id) {
        results.push({ movieId: result.movie.id });
      }
    }

    return results.length > 0 ? results : undefined;
  }
}
