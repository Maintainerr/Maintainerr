import { RuleExecuteStatusDto } from '../rules'
import { BaseEventDto } from './baseEvent.dto'
import { MaintainerrEvent } from './maintainerrEvent'

export class RuleHandlerStartedEventDto extends BaseEventDto {
  message: string

  constructor(message: string) {
    super(MaintainerrEvent.RuleHandler_Started)
    this.message = message
  }
}

export class RuleHandlerProgressedEventDto extends BaseEventDto {
  ruleGroupName: string
  totalEvaluations: number
  processedEvaluations: number

  constructor(ruleGroupName: string) {
    super(MaintainerrEvent.RuleHandler_Progressed)
    this.ruleGroupName = ruleGroupName
    this.totalEvaluations = 0
    this.processedEvaluations = 0
  }
}

export class RuleHandlerFinishedEventDto extends BaseEventDto {
  message: string

  constructor(message: string) {
    super(MaintainerrEvent.RuleHandler_Finished)
    this.message = message
  }
}

export class RuleHandlerQueueStatusUpdatedEventDto extends BaseEventDto {
  data: RuleExecuteStatusDto

  constructor(data: RuleExecuteStatusDto) {
    super(MaintainerrEvent.RuleHandlerQueue_StatusUpdated)
    this.data = data
  }
}
