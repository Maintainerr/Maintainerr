import { Injectable } from '@nestjs/common';
import {
  TmdbMovieDetails,
  TmdbTvDetails,
  TmdbTvEpisodeResult,
  TmdbTvSeasonResult,
} from '../../api/tmdb-api/interfaces/tmdb.interface';
import { TmdbApiService } from '../../api/tmdb-api/tmdb.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  MetadataImageOptions,
  PersonDetails,
  ProviderIds,
  TvHierarchyRef,
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
    if (!record || typeof record !== 'object') {
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
      studios: this.getStudios(record, type),
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
      ended:
        'in_production' in record
          ? this.deriveEnded(record.status, record.in_production)
          : undefined,
      firstAirDate:
        'first_air_date' in record
          ? record.first_air_date || undefined
          : undefined,
      seasonCount:
        'seasons' in record ? this.countRealSeasons(record.seasons) : undefined,
    };
  }

  // Movies use production companies, TV uses networks - the same split Seerr,
  // Radarr (studio) and Sonarr (network) landed on, and what media servers'
  // own TMDB agents surface as an item's studio. Movie company lists are kept
  // unfiltered: TMDB does not flag distributors or shell companies, so any
  // heuristic would silently drop real studios from a CONTAINS match.
  private getStudios(
    record: TmdbMovieDetails | TmdbTvDetails,
    type: 'movie' | 'tv',
  ): string[] | undefined {
    const values =
      type === 'movie'
        ? (record as TmdbMovieDetails).production_companies
        : (record as TmdbTvDetails).networks;

    return Array.isArray(values)
      ? values.map((value) => value.name)
      : undefined;
  }

  private countRealSeasons(
    seasons: { season_number: number }[] | undefined,
  ): number | undefined {
    if (!Array.isArray(seasons)) return undefined;
    let count = 0;
    for (const season of seasons) {
      if (season.season_number > 0) count++;
    }
    return count;
  }

  // `in_production` is the authoritative "no more episodes coming" signal;
  // status strings (Ended/Canceled/Returning Series/…) are only consulted
  // when it's absent.
  private deriveEnded(
    status: string | undefined,
    inProduction: boolean | undefined,
  ): boolean | undefined {
    if (inProduction === true) return false;
    if (inProduction === false) return true;
    if (status === 'Ended' || status === 'Canceled') return true;
    if (status === 'Returning Series' || status === 'In Production')
      return false;
    return undefined;
  }

  /** The show record already carries every season, so this costs no extra call. */
  private findSeason(
    record: TmdbMovieDetails | TmdbTvDetails | undefined,
    seasonNumber: number,
  ): TmdbTvSeasonResult | undefined {
    if (!record || !('seasons' in record) || !Array.isArray(record.seasons)) {
      return undefined;
    }

    return record.seasons.find(
      (season) => season.season_number === seasonNumber,
    );
  }

  /**
   * Episode records are not part of the show record, so this is one extra
   * request - but it returns the whole season, and it is cached like every
   * other TMDB read, so the season's other episodes come for free.
   */
  private async findEpisode(
    tmdbId: number,
    ref: TvHierarchyRef,
  ): Promise<TmdbTvEpisodeResult | undefined> {
    if (ref.episodeNumber === undefined) {
      return undefined;
    }

    const season = await this.tmdbApi.getTvSeason({
      tvId: tmdbId,
      seasonNumber: ref.seasonNumber,
    });

    return season?.episodes?.find(
      (episode) => episode.episode_number === ref.episodeNumber,
    );
  }

  async getPosterUrl(
    tmdbId: number,
    type: 'movie' | 'tv',
    options: MetadataImageOptions = {},
  ): Promise<string | undefined> {
    const { sizeHint = 'w500', ref } = options;
    const record = await this.getRecord(tmdbId, type);

    if (ref) {
      const seasonPosterUrl = this.buildImageUrl(
        this.findSeason(record, ref.seasonNumber)?.poster_path,
        sizeHint,
      );

      if (seasonPosterUrl) {
        return seasonPosterUrl;
      }
    }

    return this.buildImageUrl(record?.poster_path, sizeHint);
  }

  async getHierarchyOverview(
    tmdbId: number,
    ref: TvHierarchyRef,
  ): Promise<string | undefined> {
    if (ref.episodeNumber !== undefined) {
      const episode = await this.findEpisode(tmdbId, ref);
      return episode?.overview || undefined;
    }

    const record = await this.getRecord(tmdbId, 'tv');
    return this.findSeason(record, ref.seasonNumber)?.overview || undefined;
  }

  async getBackdropUrl(
    tmdbId: number,
    type: 'movie' | 'tv',
    options: MetadataImageOptions = {},
  ): Promise<string | undefined> {
    const { sizeHint = 'w1280', ref } = options;

    if (ref?.episodeNumber !== undefined) {
      const episode = await this.findEpisode(tmdbId, ref);
      // Stills are only published in w92/w185/w300/original, so a backdrop
      // size hint would not apply; `original` is the only one large enough.
      const stillUrl = this.buildImageUrl(episode?.still_path, 'original');

      if (stillUrl) {
        return stillUrl;
      }
    }

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
    // TMDB's find endpoint only knows imdb and tvdb. Any other namespace on
    // the item (the Sportarr agents stamp their own) has no TMDB answer.
    if (type !== 'imdb' && type !== 'tvdb') {
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
