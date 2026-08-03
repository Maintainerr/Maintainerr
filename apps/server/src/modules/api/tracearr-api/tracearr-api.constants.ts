export const TRACEARR_CACHE_ID = 'tracearr';
export const TRACEARR_HISTORY_CACHE_KEY = 'history-index';
export const TRACEARR_PAGE_SIZE = 100;

// Tracearr can only filter history by server, not by Maintainerr library. Keep
// the server-wide snapshot within the same 500k-record ceiling as the
// library-scoped Plex and Jellyfin snapshots (#3284, #3368). The rule getter
// fails closed when this limit is exceeded rather than retaining an unbounded
// Map that can exhaust the process heap.
export const TRACEARR_HISTORY_MAX_RECORDS = 500_000;
