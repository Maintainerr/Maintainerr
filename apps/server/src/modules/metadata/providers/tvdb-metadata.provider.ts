import { Injectable } from '@nestjs/common';
import {
  TvdbMovieBase,
  TvdbSeriesBase,
} from '../../api/tvdb-api/interfaces/tvdb.interface';
import { TvdbApiService } from '../../api/tvdb-api/tvdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  MetadataImageOptions,
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

  parseId(value: string): number | undefined {
    const id = Number(value);
    return Number.isFinite(id) ? id : undefined;
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

  private parseYear(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const year = Number.parseInt(value, 10);
    return Number.isFinite(year) ? year : undefined;
  }

  async getDetails(
    tvdbId: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    const record = await this.getRecord(tvdbId, type);
    if (!record || typeof record !== 'object') {
      return undefined;
    }

    return {
      id: record.id,
      title: record.name,
      year: this.parseYear(record.year),
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
      ended:
        'firstAired' in record
          ? this.deriveEnded(record.status?.name)
          : undefined,
      firstAirDate:
        'firstAired' in record ? record.firstAired || undefined : undefined,
      seasonCount:
        'firstAired' in record
          ? this.countRealSeasons(record.seasons, record.defaultSeasonType)
          : undefined,
    };
  }

  private deriveEnded(status: string | undefined): boolean | undefined {
    if (status === 'Ended') return true;
    if (status === 'Continuing' || status === 'Upcoming') return false;
    return undefined;
  }

  // TVDB returns season entries for every alternative ordering (Aired / DVD /
  // Absolute / Alternate / Regional), so filter to the series' default ordering
  // before excluding Season 0.
  private countRealSeasons(
    seasons: { number: number; type: { id: number } }[] | undefined,
    defaultSeasonType: number | undefined,
  ): number | undefined {
    if (!Array.isArray(seasons) || defaultSeasonType === undefined) {
      return undefined;
    }
    let count = 0;
    for (const season of seasons) {
      if (season.type?.id === defaultSeasonType && season.number > 0) count++;
    }
    return count;
  }

  /**
   * The series record lists a season per alternative ordering (Aired / DVD /
   * ...), so the series' default ordering decides which entry is "season N".
   * `season.image` is the one image TVDB attaches to the season itself.
   */
  private findSeasonImage(
    record: TvdbSeriesBase | TvdbMovieBase | undefined,
    seasonNumber: number,
  ): string | undefined {
    if (!record || !('seasons' in record) || !Array.isArray(record.seasons)) {
      return undefined;
    }

    return record.seasons.find(
      (season) =>
        season.type?.id === record.defaultSeasonType &&
        season.number === seasonNumber,
    )?.image;
  }

  // TVDB serves one fixed artwork URL per image, so there is no size to apply.
  async getPosterUrl(
    tvdbId: number,
    type: 'movie' | 'tv',
    options: MetadataImageOptions = {},
  ): Promise<string | undefined> {
    const record = await this.getRecord(tvdbId, type);

    if (options.ref) {
      const seasonImage = this.findSeasonImage(
        record,
        options.ref.seasonNumber,
      );

      if (seasonImage) {
        return seasonImage;
      }
    }

    return this.tvdbApi.getPosterUrl(record, type);
  }

  /**
   * The series record holds no episode entries and only reports which languages
   * a season overview is translated into, never the text, so TVDB has no
   * description below show level to read without per-episode requests.
   */
  async getHierarchyOverview(): Promise<string | undefined> {
    return undefined;
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
