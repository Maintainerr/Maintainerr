export type RuleExecuteStatusDto = {
  processingQueue: boolean
  executingRuleGroupId: number | null
  pendingRuleGroupIds: number[]
  queue: number[]
}
