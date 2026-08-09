export const TRACEARR_CACHE_ID = 'tracearr';
export const TRACEARR_HISTORY_CACHE_KEY = 'history-index';
export const TRACEARR_PAGE_SIZE = 100;

// How many of a candidate server's most recently added items to check before
// deciding it is not the media server Maintainerr manages. Sized for items the
// media server no longer has, since those are skipped rather than counted.
export const TRACEARR_SERVER_PROBE_SIZE = 20;

// How many of those items must agree before a server counts as the managed
// one. More than one, because a single agreement is cheap: "Season 1" exists
// in every library and Plex and Emby both number items from the same range.
export const TRACEARR_SERVER_MATCH_THRESHOLD = 2;

// How many items must be checked before "nothing matched" is treated as the
// wrong server rather than as unknown. Guards against condemning a correct
// server whose few recent items happen to have been deleted since.
export const TRACEARR_SERVER_PROBE_MINIMUM = 5;

// Tracearr can only filter history by server, not by Maintainerr library. Keep
// the server-wide snapshot within the same 500k-record ceiling as the
// library-scoped Plex and Jellyfin snapshots (#3284, #3368). The rule getter
// fails closed when this limit is exceeded rather than retaining an unbounded
// Map that can exhaust the process heap.
export const TRACEARR_HISTORY_MAX_RECORDS = 500_000;
