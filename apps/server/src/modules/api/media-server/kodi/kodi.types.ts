// Minimal Kodi JSON-RPC response shapes (Kodi 21 "Omega", JSON-RPC v13).
//
// These document only the fields Maintainerr reads. Field names match the Kodi
// schema verbatim (kodi.wiki/view/JSON-RPC_API/v13). Library IDs are per-type
// integers (movieid/tvshowid/seasonid/episodeid overlap), which is why the
// adapter wraps them in composite string IDs — see KodiMapper.

/** Every list result echoes the paging window plus the unfiltered total. */
export interface KodiListLimitsReturned {
  start: number;
  end: number;
  total: number;
}

/** uniqueid is an open map of provider-name → id (e.g. { imdb, tmdb, tvdb }). */
export type KodiUniqueId = Record<string, string>;

export interface KodiStreamDetailsVideo {
  codec?: string;
  width?: number;
  height?: number;
  aspect?: number;
  duration?: number;
}

export interface KodiStreamDetailsAudio {
  codec?: string;
  channels?: number;
}

export interface KodiStreamDetails {
  video?: KodiStreamDetailsVideo[];
  audio?: KodiStreamDetailsAudio[];
}

export interface KodiCast {
  name?: string;
  role?: string;
  thumbnail?: string;
}

/** Fields shared by the video item types Maintainerr touches. */
interface KodiVideoBase {
  label?: string;
  title?: string;
  playcount?: number;
  lastplayed?: string;
  dateadded?: string;
  file?: string;
  uniqueid?: KodiUniqueId;
  tag?: string[];
  genre?: string[];
  year?: number;
  premiered?: string;
  rating?: number;
  userrating?: number;
  runtime?: number;
  plot?: string;
  cast?: KodiCast[];
  streamdetails?: KodiStreamDetails;
}

export interface KodiMovie extends KodiVideoBase {
  movieid: number;
  set?: string;
  setid?: number;
}

export interface KodiTVShow extends KodiVideoBase {
  tvshowid: number;
  episode?: number;
  watchedepisodes?: number;
}

export interface KodiSeason {
  seasonid: number;
  tvshowid?: number;
  season?: number;
  label?: string;
  title?: string;
  showtitle?: string;
  playcount?: number;
  episode?: number;
  watchedepisodes?: number;
  art?: Record<string, string>;
}

export interface KodiEpisode extends KodiVideoBase {
  episodeid: number;
  tvshowid?: number;
  seasonid?: number;
  season?: number;
  episode?: number;
  showtitle?: string;
  firstaired?: string;
}

export interface KodiMoviesResult {
  movies?: KodiMovie[];
  limits: KodiListLimitsReturned;
}

export interface KodiTVShowsResult {
  tvshows?: KodiTVShow[];
  limits: KodiListLimitsReturned;
}

export interface KodiSeasonsResult {
  seasons?: KodiSeason[];
  limits: KodiListLimitsReturned;
}

export interface KodiEpisodesResult {
  episodes?: KodiEpisode[];
  limits: KodiListLimitsReturned;
}

export interface KodiMovieDetailsResult {
  moviedetails: KodiMovie;
}
export interface KodiTVShowDetailsResult {
  tvshowdetails: KodiTVShow;
}
export interface KodiSeasonDetailsResult {
  seasondetails: KodiSeason;
}
export interface KodiEpisodeDetailsResult {
  episodedetails: KodiEpisode;
}

export interface KodiTag {
  tagid: number;
  label: string;
}

export interface KodiTagsResult {
  tags?: KodiTag[];
  limits: KodiListLimitsReturned;
}

export interface KodiActivePlayer {
  playerid: number;
  type: 'video' | 'audio' | 'picture';
  playertype?: string;
}

/** Player.GetItem — the currently-playing library item (type+id are canonical). */
export interface KodiPlayerItem {
  id?: number;
  type:
    | 'unknown'
    | 'movie'
    | 'episode'
    | 'musicvideo'
    | 'song'
    | 'picture'
    | 'channel';
  tvshowid?: number;
  label?: string;
}

export interface KodiPlayerItemResult {
  item: KodiPlayerItem;
}

export interface KodiVersionResult {
  version: { major: number; minor: number; patch: number };
}

export interface KodiApplicationProperties {
  version?: { major: number; minor: number; revision?: string; tag?: string };
  name?: string;
}
