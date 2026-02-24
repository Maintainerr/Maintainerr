import { Injectable } from '@nestjs/common';
import { TvdbApiService } from '../../api/tvdb-api/tvdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  PersonDetails,
} from '../interfaces/metadata.types';

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

  assignId(ids: { tvdbId?: number }, id: number): void {
    ids.tvdbId = id;
  }

  async getDetails(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    const record =
      type === 'movie'
        ? await this.tvdbApi.getMovie(tvdbId)
        : await this.tvdbApi.getSeries(tvdbId);
    if (!record) return undefined;

    return {
      id: record.id,
      title: record.name,
      overview: record.overview ?? undefined,
      posterUrl: this.tvdbApi.getPosterUrl(record),
      backdropUrl: this.tvdbApi.getBackdropUrl(record),
      rating: record.score || undefined,
      externalIds: {
        tmdbId: this.tvdbApi.getTmdbId(record),
        tvdbId: record.id,
        imdbId: this.tvdbApi.getImdbId(record),
        type,
      },
      type,
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

  async getPersonDetails(
    tvdbPersonId: number,
  ): Promise<PersonDetails | undefined> {
    const person = await this.tvdbApi.getPerson(tvdbPersonId);
    if (!person) return undefined;

    const biography = person.biographies?.find(
      (b) => b.language === 'eng',
    )?.biography;

    const imdbRemote = person.remoteIds?.find(
      (r) => r.sourceName === 'IMDB' || r.id?.startsWith('nm'),
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
    type: 'imdb' | 'tvdb' | 'tmdb',
  ): Promise<ExternalIdSearchResult[] | undefined> {
    // TVDB only supports search by IMDB remote ID
    if (type !== 'imdb') return undefined;

    const resp = await this.tvdbApi.searchByRemoteId(String(externalId));
    if (!resp?.length) return undefined;

    const results: ExternalIdSearchResult[] = [];
    for (const r of resp) {
      if (r.series?.id) results.push({ tvShowId: r.series.id });
      if (r.movie?.id) results.push({ movieId: r.movie.id });
    }
    return results.length > 0 ? results : undefined;
  }
}
