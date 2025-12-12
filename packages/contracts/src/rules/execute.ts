export type RuleExecuteStatusDto = {
  processingQueue: boolean
  executingRuleGroupId: number | null
  queue: number[]
}
