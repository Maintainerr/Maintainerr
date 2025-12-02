import {
  MaintainerrEvent,
  RuleHandlerProgressedEventDto,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface RuleGroupProgressPayload {
  name: string;
  number: number;
  totalEvaluations: number;
}

@Injectable()
export class RuleExecutorProgressService {
  private progressedEvent: RuleHandlerProgressedEventDto | null = null;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  initialize(totalRuleGroups: number, totalEvaluations: number): void {
    this.progressedEvent = new RuleHandlerProgressedEventDto();
    this.progressedEvent.totalRuleGroups = totalRuleGroups;
    this.progressedEvent.totalEvaluations = totalEvaluations;
    this.progressedEvent.processedEvaluations = 0;
    this.progressedEvent.processingRuleGroup = undefined;
    this.emit();
  }

  startRuleGroup(payload: RuleGroupProgressPayload): void {
    const event = this.ensureEvent();
    event.processingRuleGroup = {
      name: payload.name,
      number: payload.number,
      processedEvaluations: 0,
      totalEvaluations: payload.totalEvaluations,
    };
    this.emit();
  }

  incrementProcessed(processedCount: number): void {
    if (processedCount <= 0) {
      return;
    }

    const event = this.ensureEvent();
    event.processedEvaluations += processedCount;

    if (event.processingRuleGroup) {
      event.processingRuleGroup.processedEvaluations += processedCount;
    }

    this.emit();
  }

  reset(): void {
    this.progressedEvent = null;
  }

  private emit(): void {
    const event = this.ensureEvent();
    event.time = new Date();
    this.eventEmitter.emit(
      MaintainerrEvent.CollectionHandler_Progressed,
      event,
    );
  }

  private ensureEvent(): RuleHandlerProgressedEventDto {
    if (!this.progressedEvent) {
      throw new Error(
        'RuleExecutorProgressService.initialize must be called before updating progress',
      );
    }

    return this.progressedEvent;
  }
}
