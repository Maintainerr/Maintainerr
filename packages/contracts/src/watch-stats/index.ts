/**
 * Per-item watch statistics for the media modal, in one shape for every
 * statistics service that has no richer payload of its own.
 */
export interface MediaWatchStats {
  /** The item's page on the statistics service, when it has one. */
  url?: string
  plays: number
  /** Seconds. */
  watchTime: number
  /** ISO date-time. */
  lastWatched: string | null
  users: MediaWatchStatsUser[]
}

export interface MediaWatchStatsUser {
  name: string
  plays: number
  /** Seconds. */
  watchTime: number
  lastWatched: string | null
}
