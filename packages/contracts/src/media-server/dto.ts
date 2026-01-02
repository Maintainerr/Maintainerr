import { MediaServerType } from './enums'

/**
 * Request DTO for switching media server type
 */
export interface SwitchMediaServerRequestDto {
  /**
   * Target media server type to switch to
   */
  targetServerType: MediaServerType

  /**
   * Confirmation that user understands data will be cleared
   */
  confirmDataClear: boolean

  /**
   * Whether to attempt migrating rules to the new media server.
   * Rules that use properties only available in the source server will be skipped.
   * Default: false (rules are cleared like other data)
   */
  migrateRules?: boolean
}

/**
 * Details about a rule that was skipped during migration
 */
export interface SkippedRuleDetail {
  ruleGroupId: number
  ruleGroupName: string
  ruleId: number
  reason: string
  propertyName?: string
}

/**
 * Result of rule migration attempt
 */
export interface RuleMigrationResultDto {
  /** Total rules processed */
  totalRules: number
  /** Successfully migrated rules */
  migratedRules: number
  /** Rules that couldn't be migrated */
  skippedRules: number
  /** Rule groups that had all rules migrated */
  fullyMigratedGroups: number
  /** Rule groups that had some rules skipped */
  partiallyMigratedGroups: number
  /** Rule groups that couldn't be migrated at all */
  skippedGroups: number
  /** Details about skipped rules */
  skippedDetails: SkippedRuleDetail[]
}

/**
 * Response DTO for media server switch operation
 */
export interface SwitchMediaServerResponseDto {
  status: 'OK' | 'NOK'
  code: number
  message: string
  clearedData?: {
    collections: number
    collectionMedia: number
    exclusions: number
    collectionLogs: number
  }
  /** Present when migrateRules was true */
  ruleMigration?: RuleMigrationResultDto
}

/**
 * Summary of data that will be cleared when switching media servers
 */
export interface MediaServerSwitchPreviewDto {
  currentServerType: MediaServerType
  targetServerType: MediaServerType
  dataToBeCleared: {
    collections: number
    collectionMedia: number
    exclusions: number
    collectionLogs: number
  }
  dataToBeKept: {
    generalSettings: boolean
    radarrSettings: number
    sonarrSettings: number
    overseerrSettings: boolean
    jellyseerrSettings: boolean
    tautulliSettings: boolean
    notificationSettings: boolean
  }
  /** Rule migration preview - shows what can be migrated vs skipped */
  ruleMigration?: {
    canMigrate: boolean
    totalGroups: number
    totalRules: number
    migratableRules: number
    skippedRules: number
    skippedDetails: SkippedRuleDetail[]
  }
}
