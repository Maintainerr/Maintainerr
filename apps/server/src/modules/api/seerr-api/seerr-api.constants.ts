// Shared id of the Seerr requests NodeCache (see modules/api/lib/cache.ts).
export const SEERR_REQUESTS_CACHE_ID = 'seerrrequests';

// Key under which the run-scoped request index (Map<tmdbId, SeerrRequest[]>) is
// stored in that cache. The cache is flushed between rule-group runs
// (CacheManager.flushAll), so the index is rebuilt each run from a single bulk
// /request sweep and reused across items within the run.
export const SEERR_REQUESTS_CACHE_KEY = 'request-index';

// Page size for the /request pagination sweep. Seerr imposes no upper bound on
// `take` (verified against the Seerr API source and a live instance) and its
// OFFSET pagination re-scans skipped rows, so a larger page than getUsers' 50
// means fewer round-trips and less server-side re-scan for one bulk sweep.
export const SEERR_REQUESTS_PAGE_SIZE = 100;
