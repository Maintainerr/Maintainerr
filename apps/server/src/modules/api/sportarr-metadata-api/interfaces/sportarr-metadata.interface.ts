// The fields the provider reads from the Sportarr metadata agent API
// (/api/metadata/agents/...), which a Sportarr instance and sportarr.net both
// serve. The payloads carry more; nothing else is declared.

export interface SportarrMetadataLeague {
  title: string;
  summary?: string | null;
  poster_url?: string | null;
  banner_url?: string | null;
  fanart_url?: string | null;
}

export interface SportarrMetadataSeason {
  season_number: number;
  summary?: string | null;
  poster_url?: string | null;
}

export interface SportarrMetadataEpisode {
  episode_number: number;
  summary?: string | null;
  thumb_url?: string | null;
}
