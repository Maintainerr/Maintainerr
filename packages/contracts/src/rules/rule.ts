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
  selectedPaths?: string[]
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
