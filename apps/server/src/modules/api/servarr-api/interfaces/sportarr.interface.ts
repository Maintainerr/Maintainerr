// Native Sportarr API shapes (GET /api/leagues, /api/leagues/{id}/events,
// /api/system/status). Sportarr organizes sports as leagues (≈ shows) that
// contain events (≈ episodes) grouped into seasons (calendar years). These
// interfaces mirror the fields Sportarr's own web UI consumes, so the
// connection reads Sportarr's native JSON directly rather than a
// Sonarr-shaped compatibility layer.

export interface SportarrInfo {
  appName: string;
  version: string;
  isDocker?: boolean;
  isProduction?: boolean;
}

export interface SportarrLeague {
  id: number;
  externalId: string | null;
  name: string;
  sport: string | null;
  country: string | null;
  monitored: boolean;
  added: string;
  qualityProfileId: number | null;
  // Present on the detail response (GET /api/leagues/{id}), absent on the list.
  eventCount?: number;
  fileCount?: number;
}

export interface SportarrEvent {
  id: number;
  externalId: string | null;
  title: string;
  sport: string | null;
  leagueId: number;
  leagueName: string | null;
  season: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  round: string | null;
  eventDate: string;
  broadcastDate: string | null;
  venue: string | null;
  monitored: boolean;
  hasFile: boolean;
  filePath: string | null;
  fileSize: number | null;
  quality: string | null;
  qualityProfileId: number | null;
}

export interface SportarrQualityProfile {
  id: number;
  name: string;
  isDefault: boolean;
}

export interface SportarrDownloadHistoryItem {
  eventId: number;
  seasonNumber: number | null;
  // The id the download client uses to remove the item: the torrent infohash
  // when present, otherwise the client download id (usenet). Null when the
  // grab has no captured download-client id (nothing to remove).
  downloadId: string | null;
  torrentInfoHash: string | null;
  protocol: string | null;
}
