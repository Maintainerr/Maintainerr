// Payloads of the sportarr.net media-server agent API
// (https://sportarr.net/api/metadata/agents/...). These are the same
// endpoints the Sportarr Plex, Jellyfin and Emby agents read, keyed by the
// canonical league id (lg-000278) those agents stamp on a show.

export interface SportarrHubLeague {
  id: string;
  title: string;
  summary?: string | null;
  poster_url?: string | null;
  banner_url?: string | null;
  fanart_url?: string | null;
  year?: number | null;
  sport?: string | null;
}

export interface SportarrHubSeason {
  season_number: number;
  title: string;
  summary?: string | null;
  poster_url?: string | null;
  episode_count: number;
}

export interface SportarrHubSeasonsResponse {
  seasons: SportarrHubSeason[];
}

export interface SportarrHubEpisode {
  id: string;
  episode_number: number;
  season_number: number;
  title: string;
  summary?: string | null;
  thumb_url?: string | null;
  air_date?: string | null;
}

export interface SportarrHubEpisodesResponse {
  episodes: SportarrHubEpisode[];
}
