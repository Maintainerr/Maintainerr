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
