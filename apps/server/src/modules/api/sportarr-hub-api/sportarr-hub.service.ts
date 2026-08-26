import { Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { ExternalApiService } from '../external-api/external-api.service';
import cacheManager from '../lib/cache';
import {
  SportarrHubEpisode,
  SportarrHubEpisodesResponse,
  SportarrHubLeague,
  SportarrHubSeason,
  SportarrHubSeasonsResponse,
} from './interfaces/sportarr-hub.interface';

const SPORTARR_HUB_BASE_URL = 'https://sportarr.net/api/metadata';

// The public agent API of sportarr.net: what the Sportarr media server agents
// read from, keyed by the league id they stamp on a show, no key needed.
@Injectable()
export class SportarrHubApiService extends ExternalApiService {
  constructor(protected readonly logger: MaintainerrLogger) {
    logger.setContext(SportarrHubApiService.name);
    super(SPORTARR_HUB_BASE_URL, {}, logger, {
      nodeCache: cacheManager.getCache('sportarrhub').data,
    });
  }

  async getLeague(leagueId: string): Promise<SportarrHubLeague | undefined> {
    const league = await this.get<SportarrHubLeague & { error?: string }>(
      `/agents/series/${encodeURIComponent(leagueId)}`,
    );
    // The hub answers 200 with an error field for an unknown league.
    return league && !league.error ? league : undefined;
  }

  async getSeasons(leagueId: string): Promise<SportarrHubSeason[]> {
    const response = await this.get<SportarrHubSeasonsResponse>(
      `/agents/series/${encodeURIComponent(leagueId)}/seasons`,
    );
    return response?.seasons ?? [];
  }

  async getSeasonEpisodes(
    leagueId: string,
    seasonNumber: number,
  ): Promise<SportarrHubEpisode[]> {
    const response = await this.get<SportarrHubEpisodesResponse>(
      `/agents/series/${encodeURIComponent(leagueId)}/season/${seasonNumber}/episodes`,
    );
    return response?.episodes ?? [];
  }
}
