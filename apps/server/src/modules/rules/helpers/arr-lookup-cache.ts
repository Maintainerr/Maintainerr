/**
 * Run-scoped dedupe for the *arr identity lookups* that resolve a media item to
 * its Sonarr series / Radarr movie (`getSeriesByTvdbId` / `getMovieByTmdbId`).
 *
 * Those two lookups are deliberately uncached at the API layer: the empty-show
 * cleanup re-reads them straight after a deletion, and a persisted entry would
 * serve pre-deletion state (#2757 / #2891). #2897 de-cached them for that
 * reason - but that also de-cached the rule-evaluation path, where the same
 * series/movie is resolved once per item. On an episode-level rule that means
 * the same series is looked up thousands of times per run.
 *
 * This memo restores that de-duplication WITHOUT reintroducing the bug: the
 * executor creates it for the rule-evaluation loop only and never hands it to
 * the collection-sync / action phase, so it is gone before any deletion runs
 * and the cleanup still reads Sonarr/Radarr fresh.
 *
 * It is intentionally NOT used by the Tautulli / Seerr / Plex / Jellyfin / Emby
 * getters - those already cache at the API layer, so routing them through here
 * would just be redundant double-caching.
 */
export class ArrLookupCache {
  private readonly entries = new Map<string, Promise<unknown>>();

  /**
   * Resolve `key` once and share the in-flight promise with every concurrent
   * caller (items are evaluated in parallel batches, so the same series/movie
   * is commonly requested many times at once). If `evictOnFailure` reports the
   * resolved value as a failure, the entry is dropped so a transient error
   * doesn't poison the rest of the run - later items retry instead.
   */
  memoize<T>(
    key: string,
    fetch: () => Promise<T>,
    evictOnFailure?: (value: T) => boolean,
  ): Promise<T> {
    const existing = this.entries.get(key) as Promise<T> | undefined;
    if (existing !== undefined) {
      return existing;
    }

    const pending = fetch();
    this.entries.set(key, pending);

    if (evictOnFailure) {
      void pending
        .then((value) => {
          if (evictOnFailure(value)) {
            this.entries.delete(key);
          }
        })
        .catch(() => {
          this.entries.delete(key);
        });
    }

    return pending;
  }
}
