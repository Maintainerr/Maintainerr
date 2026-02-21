import { z } from 'zod'
import { MediaServerType } from './enums'

/**
 * Zod schema for validating switch media server requests
 */
export const switchMediaServerSchema = z.object({
  targetServerType: z.nativeEnum(MediaServerType),
  migrateRules: z.boolean().optional(),
})

/**
 * Request for switching media server type
 */
export type SwitchMediaServerRequest = z.infer<typeof switchMediaServerSchema>

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
export interface RuleMigrationResult {
  totalRules: number
  migratedRules: number
  skippedRules: number
  fullyMigratedGroups: number
  partiallyMigratedGroups: number
  skippedGroups: number
  skippedDetails: SkippedRuleDetail[]
}

/**
 * Response for media server switch operation
 */
export interface SwitchMediaServerResponse {
  status: 'OK' | 'NOK'
  code: number
  message: string
  clearedData?: {
    collections: number
    collectionMedia: number
    exclusions: number
    collectionLogs: number
  }
  ruleMigration?: RuleMigrationResult
}

/**
 * Preview of rule migration (what can/cannot be migrated)
 */
export interface RuleMigrationPreview {
  canMigrate: boolean
  totalGroups: number
  totalRules: number
  migratableRules: number
  skippedRules: number
  skippedDetails: SkippedRuleDetail[]
}

/**
 * Preview of data that will be cleared/kept when switching media servers
 */
export interface MediaServerSwitchPreview {
  currentServerType: MediaServerType | null
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
  ruleMigration?: RuleMigrationPreview
}
