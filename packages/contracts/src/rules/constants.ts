/**
 * Rule possibility operators for comparison
 */
export enum RulePossibility {
  BIGGER,
  SMALLER,
  EQUALS,
  NOT_EQUALS,
  CONTAINS,
  BEFORE,
  AFTER,
  IN_LAST,
  IN_NEXT,
  NOT_CONTAINS,
  CONTAINS_PARTIAL,
  NOT_CONTAINS_PARTIAL,
  CONTAINS_ALL,
  NOT_CONTAINS_ALL,
  COUNT_EQUALS,
  COUNT_NOT_EQUALS,
  COUNT_BIGGER,
  COUNT_SMALLER,
  EXISTS,
  NOT_EXISTS,
}

/**
 * Rule operators for combining rule conditions
 */
export enum RuleOperators {
  AND,
  OR,
}

/**
 * Application identifiers for rule sources
 */
export enum Application {
  PLEX = 0,
  RADARR = 1,
  SONARR = 2,
  SEERR = 3,
  TAUTULLI = 4,
  SPORTARR = 5,
  JELLYFIN = 6,
  EMBY = 7,
  STREAMYSTATS = 8,
  TRACEARR = 9,
}

/**
 * Human-readable names for applications
 */
export const ApplicationNames: Record<Application, string> = {
  [Application.PLEX]: 'Plex',
  [Application.RADARR]: 'Radarr',
  [Application.SONARR]: 'Sonarr',
  [Application.SEERR]: 'Seerr',
  [Application.TAUTULLI]: 'Tautulli',
  [Application.SPORTARR]: 'Sportarr',
  [Application.JELLYFIN]: 'Jellyfin',
  [Application.EMBY]: 'Emby',
  [Application.STREAMYSTATS]: 'Streamystats',
  [Application.TRACEARR]: 'Tracearr',
}

/**
 * Media status for Seerr requests
 */
export enum RequestMediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
}

export const DISKSPACE_REMAINING_PROPERTY = 'diskspace_remaining_gb'
export const DISKSPACE_TOTAL_PROPERTY = 'diskspace_total_gb'

/**
 * Properties scoped to the single user named by the rule's `username`. Shared
 * by the watch-history companions (Streamystats, Tautulli, Tracearr).
 */
export const PER_USER_PROPERTIES = [
  'viewCountByUser',
  'watchTimeByUser',
  'lastViewedAtByUser',
] as const

export type PerUserProperty = (typeof PER_USER_PROPERTIES)[number]

export const isPerUserProperty = (
  property: string | undefined,
): property is PerUserProperty =>
  PER_USER_PROPERTIES.includes(property as PerUserProperty)
