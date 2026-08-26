import { Injectable } from '@nestjs/common';
import {
  sportarrLeagueExternalIdFromNumber,
  sportarrLeagueNumberFromExternalId,
  sportarrLeagueNumberFromTvdbAlias,
} from '../../api/servarr-api/helpers/sportarr-external-id';
import { SportarrHubApiService } from '../../api/sportarr-hub-api/sportarr-hub.service';
import { IMetadataProvider } from '../interfaces/metadata-provider.interface';
import {
  ExternalIdSearchResult,
  MetadataDetails,
  MetadataImageOptions,
  PersonDetails,
  ProviderIds,
  TvHierarchyRef,
} from '../interfaces/metadata.types';

// Artwork and descriptions for Sportarr leagues, read from sportarr.net by the
// league id the Sportarr media server agents stamp on a show. The provider's
// numeric id is the digits of that league id (lg-000278 -> 278), which is also
// what the tvdb alias encodes (900000278), so a show that only carries the
// alias resolves here too.
@Injectable()
export class SportarrMetadataProvider implements IMetadataProvider {
  readonly name = 'Sportarr';
  readonly idKey = 'sportarr';

  constructor(private readonly hub: SportarrHubApiService) {}

  isAvailable(): boolean {
    return true;
  }

  parseId(value: string): number | undefined {
    return sportarrLeagueNumberFromExternalId(value);
  }

  extractId(ids: ProviderIds): number | undefined {
    const own = ids[this.idKey];
    if (typeof own === 'number' && Number.isInteger(own) && own > 0) {
      return own;
    }
    if (typeof own === 'string') {
      const parsed = this.parseId(own);
      if (parsed !== undefined) {
        return parsed;
      }
    }
    return sportarrLeagueNumberFromTvdbAlias(Number(ids.tvdb));
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
    const leagueId = sportarrLeagueExternalIdFromNumber(id);
    const league = await this.hub.getLeague(leagueId);
    if (!league) {
      return undefined;
    }
    return {
      id,
      title: league.title,
      year: league.year ?? (await this.firstSeasonYear(leagueId)),
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
    const leagueId = sportarrLeagueExternalIdFromNumber(id);
    if (options.ref) {
      const season = await this.findSeason(leagueId, options.ref);
      if (season?.poster_url) {
        return season.poster_url;
      }
    }
    const league = await this.hub.getLeague(leagueId);
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
    const leagueId = sportarrLeagueExternalIdFromNumber(id);
    if (options.ref?.episodeNumber !== undefined) {
      const episode = await this.findEpisode(leagueId, options.ref);
      if (episode?.thumb_url) {
        return episode.thumb_url;
      }
    }
    const league = await this.hub.getLeague(leagueId);
    return league ? this.leagueBackdrop(league) : undefined;
  }

  async getHierarchyOverview(
    id: number,
    ref: TvHierarchyRef,
  ): Promise<string | undefined> {
    const leagueId = sportarrLeagueExternalIdFromNumber(id);
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

  // The tvdb alias is the only other id that names a league, and reversing
  // it needs no request.
  async findByExternalId(
    externalId: string | number,
    type: string,
  ): Promise<ExternalIdSearchResult[] | undefined> {
    if (type !== 'tvdb') {
      return undefined;
    }
    const id = sportarrLeagueNumberFromTvdbAlias(Number(externalId));
    return id === undefined ? undefined : [{ tvShowId: id }];
  }

  // Many leagues have no founding year on the hub. The first season stands
  // in, so the year check upstream has something to compare instead of
  // warning on every resolution.
  private async firstSeasonYear(leagueId: string): Promise<number | undefined> {
    const seasons = await this.hub.getSeasons(leagueId);
    const years = seasons
      .map((season) => season.season_number)
      .filter((year) => Number.isInteger(year) && year > 0);
    return years.length > 0 ? Math.min(...years) : undefined;
  }

  // Leagues rarely have fanart; the banner is the next best landscape image.
  private leagueBackdrop(league: {
    fanart_url?: string | null;
    banner_url?: string | null;
  }): string | undefined {
    return league.fanart_url ?? league.banner_url ?? undefined;
  }

  private async findSeason(leagueId: string, ref: TvHierarchyRef) {
    const seasons = await this.hub.getSeasons(leagueId);
    return seasons.find((season) => season.season_number === ref.seasonNumber);
  }

  private async findEpisode(leagueId: string, ref: TvHierarchyRef) {
    const episodes = await this.hub.getSeasonEpisodes(
      leagueId,
      ref.seasonNumber,
    );
    return episodes.find(
      (episode) => episode.episode_number === ref.episodeNumber,
    );
  }
}
