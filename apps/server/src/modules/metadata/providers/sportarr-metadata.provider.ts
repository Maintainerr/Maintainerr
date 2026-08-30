import {
  sportarrLeagueId,
  sportarrLeagueNumber,
  sportarrLeagueNumberFromTvdbAlias,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import {
  SportarrMetadataEpisode,
  SportarrMetadataLeague,
  SportarrMetadataSeason,
} from '../../api/sportarr-metadata-api/interfaces/sportarr-metadata.interface';
import { SportarrMetadataApiService } from '../../api/sportarr-metadata-api/sportarr-metadata.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  MetadataImageOptions,
  PersonDetails,
  ProviderIds,
  TvHierarchyRef,
} from '../interfaces/metadata.types';

// Artwork and descriptions for Sportarr leagues. The provider id is the number
// inside the league id the Sportarr agents stamp (lg-000278 -> 278), which is
// also what the tvdb alias encodes (900000278), so a show that only carries the
// alias resolves here too. A league has no reliable release year, and the
// year check accepts a provider without one, so none is reported.
@Injectable()
export class SportarrMetadataProvider implements IMetadataProvider {
  readonly name = 'Sportarr';
  readonly idKey = 'sportarr';
  // A league runs every year, so Sportarr dates events rather than leagues.
  readonly hasReleaseYears = false;

  constructor(private readonly api: SportarrMetadataApiService) {}

  // Nothing to read from means the ids this provider claims, the alias
  // included, cannot be answered, and a claim it cannot answer would fail the
  // whole resolution rather than only its own part of it.
  isAvailable(): boolean {
    return this.api.hasReachableSource();
  }

  parseId(value: string): number | undefined {
    return sportarrLeagueNumber(value);
  }

  // A league's artwork and description are Sportarr's own, so a show that
  // carries a Sportarr id answers here before the primary provider.
  isAuthorityFor(ids: ProviderIds): boolean {
    return this.extractId(ids) !== undefined;
  }

  extractId(ids: ProviderIds): number | undefined {
    const own = ids[this.idKey];
    if (typeof own === 'number') {
      return Number.isInteger(own) && own > 0 ? own : undefined;
    }
    const parsed = typeof own === 'string' ? this.parseId(own) : undefined;
    return parsed ?? sportarrLeagueNumberFromTvdbAlias(Number(ids.tvdb));
  }

  assignId(ids: ProviderIds, id: number): void {
    ids[this.idKey] = id;
  }

  async getDetails(
    id: number,
    type: 'movie' | 'tv',
  ): Promise<MetadataDetails | undefined> {
    if (type !== 'tv') {
      return undefined;
    }
    const league = await this.api.getLeague(sportarrLeagueId(id));
    if (!league) {
      return undefined;
    }
    return {
      id,
      title: league.title,
      overview: league.summary || undefined,
      posterUrl: league.poster_url ?? undefined,
      backdropUrl: this.leagueBackdrop(league),
      externalIds: { sportarr: id, type },
      type,
    };
  }

  async getPosterUrl(
    id: number,
    type: 'movie' | 'tv',
    options: MetadataImageOptions = {},
  ): Promise<string | undefined> {
    if (type !== 'tv') {
      return undefined;
    }
    const leagueId = sportarrLeagueId(id);
    if (options.ref) {
      const season = await this.findSeason(leagueId, options.ref);
      if (season?.poster_url) {
        return season.poster_url;
      }
    }
    const league = await this.api.getLeague(leagueId);
    return league?.poster_url ?? undefined;
  }

  async getBackdropUrl(
    id: number,
    type: 'movie' | 'tv',
    options: MetadataImageOptions = {},
  ): Promise<string | undefined> {
    if (type !== 'tv') {
      return undefined;
    }
    const leagueId = sportarrLeagueId(id);
    if (options.ref?.episodeNumber !== undefined) {
      const episode = await this.findEpisode(leagueId, options.ref);
      if (episode?.thumb_url) {
        return episode.thumb_url;
      }
    }
    const league = await this.api.getLeague(leagueId);
    return league ? this.leagueBackdrop(league) : undefined;
  }

  async getHierarchyOverview(
    id: number,
    ref: TvHierarchyRef,
  ): Promise<string | undefined> {
    const leagueId = sportarrLeagueId(id);
    if (ref.episodeNumber !== undefined) {
      const episode = await this.findEpisode(leagueId, ref);
      return episode?.summary || undefined;
    }
    const season = await this.findSeason(leagueId, ref);
    return season?.summary || undefined;
  }

  async getPersonDetails(): Promise<PersonDetails | undefined> {
    return undefined;
  }

  // Nothing bridges into this namespace: extractId already reads the tvdb
  // alias, so the service never asks.
  async findByExternalId(): Promise<ExternalIdSearchResult[] | undefined> {
    return undefined;
  }

  // Leagues rarely have fanart; the banner is the next best landscape image.
  private leagueBackdrop(league: SportarrMetadataLeague): string | undefined {
    return league.fanart_url ?? league.banner_url ?? undefined;
  }

  private async findSeason(
    leagueId: string,
    ref: TvHierarchyRef,
  ): Promise<SportarrMetadataSeason | undefined> {
    const seasons = await this.api.getSeasons(leagueId);
    return seasons.find((season) => season.season_number === ref.seasonNumber);
  }

  private async findEpisode(
    leagueId: string,
    ref: TvHierarchyRef,
  ): Promise<SportarrMetadataEpisode | undefined> {
    const episodes = await this.api.getSeasonEpisodes(
      leagueId,
      ref.seasonNumber,
    );
    return episodes.find(
      (episode) => episode.episode_number === ref.episodeNumber,
    );
  }
}
