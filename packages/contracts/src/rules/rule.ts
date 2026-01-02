/**
 * Media type filter for rules
 * Determines which rules apply to which type of media
 */
export enum MediaType {
  BOTH = 0,
  MOVIE = 1,
  SHOW = 2,
}

export interface IComparisonStatistics {
  /** Media server item ID (Plex ratingKey or Jellyfin GUID) */
  mediaServerId: string
  result: boolean
  sectionResults: ISectionComparisonResults[]
}

export interface ISectionComparisonResults {
  id: number
  result: boolean
  operator?: string
  ruleResults: IRuleComparisonResult[]
}

export interface IRuleComparisonResult {
  firstValueName: string
  firstValue: RuleValueType
  secondValueName: string
  secondValue: RuleValueType
  action: string
  operator?: string
  result: boolean
}

export type RuleValueType =
  | number
  | Date
  | string
  | boolean
  | number[]
  | string[]
  | null
