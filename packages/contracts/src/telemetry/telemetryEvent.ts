/**
 * The telemetry ping. This is the ONLY thing that ever leaves the server, and
 * it contains nothing identifying: no clientId, no instanceId, no timestamp
 * (the collector stamps the ISO week), no hostname, no URLs, no keys, no
 * library names, no media titles.
 *
 * Anonymity comes from four properties together, not from any one of them:
 * there is no identifier, the detailed block is sampled 1 week in
 * TELEMETRY_SAMPLE_DIVISOR, the collector stores it as independent counters
 * that cannot be recombined into a row, and the public stats are k-suppressed.
 *
 * Every value must survive the collector's allowlist or it is discarded
 * silently, which would leave a ping that looks healthy but measures nothing.
 * The rules it enforces (confirmed against the collector's src/index.ts):
 *  - each value must match ^[\w.\-+]+$ - word chars, dots, dashes, plus. A
 *    space, slash, colon or comma discards the value.
 *  - version and versionTag <= 32 chars; arch, platform and mediaServer <= 16;
 *    every usage bucket <= 8; each rulesApps entry <= 16;
 *    ruleProperties <= 48; integrations and notificationAgents <= 24;
 *    features and arrActions <= 32; mediaTypes <= 8.
 *  - per-list cardinality: rulesApps 10, ruleProperties 25, integrations 16,
 *    features 10, notificationAgents 16, mediaTypes 4, arrActions 6. Lists are
 *    de-duplicated and then truncated, so order decides what survives.
 *  - version, versionTag, arch and platform are required; omitting any one of
 *    them rejects the whole ping.
 *  - the serialized body must be <= 4096 characters, or the collector answers
 *    413 and the ping is lost.
 *
 * Changing what is sent is a change to a published privacy commitment: the
 * data table in the collector's README, the LABELS map in its src/page.ts and
 * the release notes all have to change with it. Nothing checks that sync, so
 * derive every value written there by reading the code, never by inference.
 */
export interface TelemetryPing {
  // Census. Sent by every instance, every week, and exact - this is what makes
  // the active-instance count and version adoption real numbers rather than
  // estimates.
  /** Release version, or the build stream for a non-release build. */
  version: string
  /** The stream this build tracks: latest, stable, main, development. */
  versionTag: string
  isDocker: boolean
  nodeMajor: number
  arch: string
  platform: string
  mediaServer: 'plex' | 'jellyfin' | 'emby' | 'none'

  /**
   * Rich sample. Included in 1 week out of TELEMETRY_SAMPLE_DIVISOR, and
   * ABSENT (not empty) in every other week. The collector explodes it into
   * independent (metric, value) counters, so no combination of these fields is
   * ever stored together and a sample cannot be linked to its source or to
   * another sample.
   */
  sample?: {
    // No locale: the display language is a per-browser preference and there
    // are no user accounts, so the server has no value it could report that
    // would be true for everyone using it.
    /** Every value is a bucket() string. Raw counts are never sent. */
    usage: {
      ruleGroups: string
      activeRuleGroups: string
      collections: string
      manualCollections: string
      exclusions: string
      notifications: string
      /**
       * Total rows across every collection, as a sizeBucket(). Answers how big
       * an install is, which decides caching and prefetch behaviour.
       */
      collectionItems: string
    }
    /** Apps rules target, lowercased, e.g. ['plex', 'radarr']. */
    rulesApps: string[]
    /** Distinct 'app.propName' referenced by rules, at most 25. */
    ruleProperties: string[]
    /** Rule-group data types in use, e.g. ['movie', 'show']. */
    mediaTypes: string[]
    /** ServarrAction names in use on collections, e.g. ['UNMONITOR']. */
    arrActions: string[]
    /** Agent types with a configured notification, e.g. ['discord']. */
    notificationAgents: string[]
    /** Configured integrations, e.g. ['radarr', 'seerr']. */
    integrations: string[]
    /** Features in use, e.g. ['overlays', 'metadata_tmdb_primary']. */
    features: string[]
  }
}

/**
 * Bucket a count so an exact number never leaves the server. A bucket is a
 * collector-legal token: dashes and the trailing plus are both inside its
 * allowlist, and the widest bucket is 5 characters against a cap of 8.
 */
export const bucket = (n: number): string =>
  n <= 0
    ? '0'
    : n === 1
      ? '1'
      : n <= 4
        ? '2-4'
        : n <= 9
          ? '5-9'
          : n <= 24
            ? '10-24'
            : '25+'

/**
 * Rich-sample divisor: the sample block is included in 1 week out of this
 * many, so roughly once every 0.6 years per instance. MUST match the
 * collector's SAMPLE_DIVISOR - change one and you change both. Changing it
 * after a release splits the fleet across two rates, and the collector
 * publishes only one, so every extrapolation is skewed until the old
 * versions are gone.
 */
export const TELEMETRY_SAMPLE_DIVISOR = 32

/**
 * Wider scale for item counts, whose interesting range is thousands rather than
 * the tens bucket() covers. Boundaries follow where behaviour actually changes:
 * 500 is RULE_REMOVAL_MARKER_CHUNK, 2k is ENRICHMENT_ID_CHUNK (measured flat
 * from 500 to 16000), and 15k is the library size that drove the cache key
 * bound in #3284. Every label is <= 8 characters, the collector's cap on a
 * usage value.
 */
export const sizeBucket = (n: number): string =>
  n <= 0
    ? '0'
    : n < 500
      ? '1-499'
      : n < 2000
        ? '500-2k'
        : n < 5000
          ? '2k-5k'
          : n < 15000
            ? '5k-15k'
            : '15k+'

/**
 * Cardinality cap on ruleProperties. MUST match the collector, which
 * de-duplicates and then truncates to this many; capping here instead keeps
 * the dropped entries visible in the preview rather than silently discarded
 * on arrival.
 */
export const TELEMETRY_MAX_RULE_PROPERTIES = 25

/**
 * Length cap on a ruleProperties entry. MUST match the collector, which
 * discards a longer value outright. One real identifier
 * (plex.sw_collection_names_including_parent_and_smart, 51 chars) exceeds it,
 * so identifiers are truncated to this length rather than lost.
 */
export const TELEMETRY_MAX_RULE_PROPERTY_LENGTH = 48
