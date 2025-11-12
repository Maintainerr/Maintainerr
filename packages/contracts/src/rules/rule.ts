export interface IComparisonStatistics {
  plexId: number
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
  result: RuleResultType
}

export type RuleValueType =
  | number
  | Date
  | string
  | boolean
  | number[]
  | string[]
  | null

export type RuleResultType = true | false | 'error'
