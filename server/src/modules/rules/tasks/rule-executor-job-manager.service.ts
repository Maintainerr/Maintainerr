import {
  MaintainerrEvent,
  RuleHandlerQueueStatusUpdatedEventDto,
} from '@maintainerr/contracts';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MaintainerrLogger } from '../../logging/logs.service';
import { ExecutionLockService } from '../../tasks/execution-lock.service';
import { RuleExecutorService } from './rule-executor.service';

type QueueItem = {
  ruleGroupId: number;
};

/*
 * This service owns the in-memory rule execution queue.
 * It ensures only one rule group executes at a time (single-flight) while
 * allowing an unbounded queue with no duplicate entries.
 */
@Injectable()
export class RuleExecutorJobManagerService implements OnApplicationShutdown {
  private readonly queue: QueueItem[] = [];
  private abortController: AbortController | undefined;
  private executingRuleGroupId: number | null = null;
  private processingQueue = false; // true while the internal queue is being processed
  private processQueuePromise: Promise<void> | null = null;
  private isShuttingDown = false;
  private readonly reservedRuleGroupIds = new Set<number>();

  constructor(
    private readonly ruleExecutorService: RuleExecutorService,
    private readonly executionLock: ExecutionLockService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(RuleExecutorJobManagerService.name);
  }

  async onApplicationShutdown() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    await this.stopProcessing();
  }

  public async stopProcessing() {
    // Drop any queued work – we only care about the in-flight execution
    this.queue.length = 0;

    this.abortController?.abort();

    this.eventEmitter.emit(
      MaintainerrEvent.RuleHandlerQueue_StatusUpdated,
      new RuleHandlerQueueStatusUpdatedEventDto(this.getStatus()),
    );

    // Wait for the active execution to exit (it will finish quickly once aborted)
    if (this.processQueuePromise != null) {
      try {
        await this.processQueuePromise;
      } catch (err) {
        this.logger.debug(err);
      }
    }
  }

  public isProcessing(): boolean {
    return this.processingQueue;
  }

  public isRuleGroupProcessingOrQueued(ruleGroupId: number): boolean {
    if (
      this.executingRuleGroupId === ruleGroupId ||
      this.reservedRuleGroupIds.has(ruleGroupId)
    ) {
      return true;
    }

    const indexInQueue = this.queue.findIndex(
      (q) => q.ruleGroupId === ruleGroupId,
    );
    return indexInQueue !== -1;
  }

  public enqueue(request: QueueItem): boolean {
    const indexInQueue = this.queue.findIndex(
      (q) => q.ruleGroupId === request.ruleGroupId,
    );
    if (indexInQueue !== -1) return true; // already queued

    if (this.reservedRuleGroupIds.has(request.ruleGroupId)) {
      return true; // reserved for execution
    }

    if (this.executingRuleGroupId === request.ruleGroupId) {
      return true; // already executing
    }

    if (this.isShuttingDown) {
      this.logger.warn(
        `Skipping enqueue for rule group ID ${request.ruleGroupId}; application shutdown in progress`,
      );
      return false;
    }

    this.queue.push({ ruleGroupId: request.ruleGroupId });

    this.eventEmitter.emit(
      MaintainerrEvent.RuleHandlerQueue_StatusUpdated,
      new RuleHandlerQueueStatusUpdatedEventDto(this.getStatus()),
    );

    void this.processQueue();
    return true;
  }

  public stopProcessingRuleGroup(ruleGroupId: number) {
    this.tryRemoveRuleGroupFromPendingQueue(ruleGroupId);

    // Abort if currently executing
    if (this.executingRuleGroupId === ruleGroupId) {
      this.abortController?.abort();
    }
  }

  public removeFromQueue(ruleGroupId: number) {
    this.tryRemoveRuleGroupFromPendingQueue(ruleGroupId);
  }

  public getQueuedRuleGroupIds(): number[] {
    return this.queue.map((q) => q.ruleGroupId);
  }

  private tryRemoveRuleGroupFromPendingQueue(ruleGroupId: number) {
    const indexOfJob = this.queue.findIndex(
      (q) => q.ruleGroupId === ruleGroupId,
    );
    if (indexOfJob !== -1) {
      this.queue.splice(indexOfJob, 1);

      this.eventEmitter.emit(
        MaintainerrEvent.RuleHandlerQueue_StatusUpdated,
        new RuleHandlerQueueStatusUpdatedEventDto(this.getStatus()),
      );
    }
  }

  private async processQueue() {
    if (this.processingQueue) return this.processQueuePromise;
    this.processingQueue = true;
    this.processQueuePromise = (async () => {
      try {
        while (this.queue.length > 0) {
          const next = this.queue.shift();
          this.eventEmitter.emit(
            MaintainerrEvent.RuleHandlerQueue_StatusUpdated,
            new RuleHandlerQueueStatusUpdatedEventDto(this.getStatus()),
          );
          if (!next) break;

          await this.executeJob(next);
        }
      } finally {
        this.processingQueue = false;
        this.processQueuePromise = null;
      }
    })();

    return this.processQueuePromise;
  }

  private async executeJob(request: QueueItem) {
    this.reservedRuleGroupIds.add(request.ruleGroupId);
    const release = await this.executionLock.acquire('rules-collections-lock');
    this.executingRuleGroupId = request.ruleGroupId;
    this.abortController = new AbortController();
    this.eventEmitter.emit(
      MaintainerrEvent.RuleHandlerQueue_StatusUpdated,
      new RuleHandlerQueueStatusUpdatedEventDto(this.getStatus()),
    );

    try {
      await this.ruleExecutorService.executeForRuleGroups(
        request.ruleGroupId,
        this.abortController.signal,
      );
    } catch (e) {
      this.logger.error(
        `An error occurred while executing job for rule group ${request.ruleGroupId}`,
        e,
      );
    } finally {
      release();

      this.executingRuleGroupId = null;
      this.abortController = undefined;

      this.reservedRuleGroupIds.delete(request.ruleGroupId);
      this.eventEmitter.emit(
        MaintainerrEvent.RuleHandlerQueue_StatusUpdated,
        new RuleHandlerQueueStatusUpdatedEventDto(this.getStatus()),
      );
    }
  }

  public getStatus() {
    return {
      processingQueue: this.processingQueue,
      executingRuleGroupId: this.executingRuleGroupId,
      queue: this.queue.map((q) => q.ruleGroupId),
    };
  }
}
