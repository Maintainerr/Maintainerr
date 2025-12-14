import {
  MaintainerrEvent,
  RuleHandlerProgressedEventDto,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface RuleGroupProgressPayload {
  name: string;
  totalEvaluations: number;
}

@Injectable()
export class RuleExecutorProgressService {
  private progressedEvent: RuleHandlerProgressedEventDto | null = null;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  initialize(payload: RuleGroupProgressPayload): void {
    this.progressedEvent = new RuleHandlerProgressedEventDto(payload.name);
    this.progressedEvent.totalEvaluations = payload.totalEvaluations;
    this.progressedEvent.processedEvaluations = 0;
    this.emit();
  }

  incrementProcessed(processedCount: number): void {
    if (processedCount <= 0) {
      return;
    }

    const event = this.ensureEvent();
    event.processedEvaluations += processedCount;
    this.emit();
  }

  reset(): void {
    this.progressedEvent = null;
  }

  private emit(): void {
    const event = this.ensureEvent();
    event.time = new Date();
    this.eventEmitter.emit(MaintainerrEvent.RuleHandler_Progressed, event);
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
