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
}

/**
 * Human-readable translations for rule possibilities
 */
export const RulePossibilityTranslations: Record<RulePossibility, string> = {
  [RulePossibility.BIGGER]: 'Bigger',
  [RulePossibility.SMALLER]: 'Smaller',
  [RulePossibility.EQUALS]: 'Equals',
  [RulePossibility.NOT_EQUALS]: 'Not Equals',
  [RulePossibility.CONTAINS]: 'Contains (Exact list match)',
  [RulePossibility.BEFORE]: 'Before',
  [RulePossibility.AFTER]: 'After',
  [RulePossibility.IN_LAST]: 'In Last',
  [RulePossibility.IN_NEXT]: 'In Next',
  [RulePossibility.NOT_CONTAINS]: 'Not Contains (Exact list match)',
  [RulePossibility.CONTAINS_PARTIAL]: 'Contains (Partial list match)',
  [RulePossibility.NOT_CONTAINS_PARTIAL]: 'Not Contains (Partial list match)',
  [RulePossibility.CONTAINS_ALL]: 'Contains (All items)',
  [RulePossibility.NOT_CONTAINS_ALL]: 'Not Contains (All items)',
  [RulePossibility.COUNT_EQUALS]: 'Count Equals',
  [RulePossibility.COUNT_NOT_EQUALS]: 'Count Does Not Equal',
  [RulePossibility.COUNT_BIGGER]: 'Count Is Bigger Than',
  [RulePossibility.COUNT_SMALLER]: 'Count Is Smaller Than',
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
  OVERSEERR = 3,
  TAUTULLI = 4,
  JELLYSEERR = 5,
  JELLYFIN = 6,
}

/**
 * Human-readable names for applications
 */
export const ApplicationNames: Record<Application, string> = {
  [Application.PLEX]: 'Plex',
  [Application.RADARR]: 'Radarr',
  [Application.SONARR]: 'Sonarr',
  [Application.OVERSEERR]: 'Overseerr',
  [Application.TAUTULLI]: 'Tautulli',
  [Application.JELLYSEERR]: 'Jellyseerr',
  [Application.JELLYFIN]: 'Jellyfin',
}

/**
 * Media status for Overseerr/Jellyseerr requests
 */
export enum RequestMediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
}
