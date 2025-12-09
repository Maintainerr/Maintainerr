export type RuleExecuteStatusDto = {
  processingQueue: boolean
  executingRuleGroupId: number | null
  queueLength: number
}
