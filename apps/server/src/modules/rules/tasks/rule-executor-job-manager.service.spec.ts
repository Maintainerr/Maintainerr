import { createMockLogger } from '../../../../test/utils/data';
import { ExecutionLockService } from '../../tasks/execution-lock.service';
import { RuleExecutorJobManagerService } from './rule-executor-job-manager.service';
import { RuleExecutionResult } from './rule-executor.service';

type ExecuteMock = jest.Mock<
  Promise<RuleExecutionResult>,
  [number, AbortSignal]
>;

const createDeferred = () => {
  let resolve: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve: resolve! };
};

describe('RuleExecutorJobManagerService', () => {
  const logger = createMockLogger();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildService = (executeMock?: ExecuteMock) => {
    const ruleExecutorService = {
      executeForRuleGroups:
        executeMock ??
        (jest.fn().mockResolvedValue({ status: 'success' }) as ExecuteMock),
    };

    const eventEmitter = {
      emit: jest.fn(),
    };

    const executionLock = {
      acquire: jest.fn().mockResolvedValue(jest.fn()),
    } as unknown as ExecutionLockService;

    const mediaServerFactory = {
      verifyConnection: jest.fn().mockResolvedValue({}),
    };

    return {
      service: new RuleExecutorJobManagerService(
        ruleExecutorService as any,
        executionLock,
        mediaServerFactory as any,
        eventEmitter as any,
        logger as any,
      ),
      ruleExecutorService,
      executionLock,
      mediaServerFactory,
      eventEmitter,
    };
  };

  const flushMicrotasks = async () => Promise.resolve();
  const waitForNextTick = async () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('enqueues without duplicates and processes sequentially', async () => {
    const first = createDeferred();
    const second = createDeferred();
    const inFlight: number[] = [];

    const executeMock: ExecuteMock = jest
      .fn()
      .mockImplementation(async (id: number) => {
        inFlight.push(id);
        if (id === 1) {
          await first.promise;
        } else {
          await second.promise;
        }
        inFlight.pop();
        return { status: 'success' };
      });

    const { service } = buildService(executeMock);

    service.enqueue({ ruleGroupId: 1 });
    service.enqueue({ ruleGroupId: 1 }); // duplicate should be ignored
    service.enqueue({ ruleGroupId: 2 });

    await flushMicrotasks();
    expect(inFlight).toEqual([1]);
    expect(executeMock).toHaveBeenCalledTimes(1);

    first.resolve();
    await flushMicrotasks();
    await waitForNextTick();
    await flushMicrotasks();
    await waitForNextTick();
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(inFlight).toEqual([2]);

    second.resolve();
    await flushMicrotasks();
    expect(service.getQueuedRuleGroupIds()).toHaveLength(0);
    expect(service.isProcessing()).toBe(false);
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the currently executing job when requested', async () => {
    const executionDeferred = createDeferred();
    const executeMock: ExecuteMock = jest.fn().mockImplementation(async () => {
      await executionDeferred.promise;
      return { status: 'success' };
    });

    const { service } = buildService(executeMock);

    service.enqueue({ ruleGroupId: 42 });
    await flushMicrotasks();

    service.stopProcessingRuleGroup(42);

    const abortController = (service as any).abortController as
      | AbortController
      | undefined;
    expect(abortController?.signal.aborted).toBe(true);

    // Let the execution finish to avoid dangling promises
    executionDeferred.resolve();
    await flushMicrotasks();
  });

  it('drops the whole queue silently when the media server is unreachable at queue start', async () => {
    const executeMock: ExecuteMock = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const { service, mediaServerFactory, eventEmitter } =
      buildService(executeMock);

    mediaServerFactory.verifyConnection.mockRejectedValue(
      new Error('Media server still unreachable after re-initialization'),
    );

    service.enqueue({ ruleGroupId: 1 });
    service.enqueue({ ruleGroupId: 2 });
    service.enqueue({ ruleGroupId: 3 });

    await flushMicrotasks();
    await waitForNextTick();
    await flushMicrotasks();

    expect(executeMock).not.toHaveBeenCalled();
    expect(service.getQueuedRuleGroupIds()).toHaveLength(0);
    expect(service.isProcessing()).toBe(false);

    const failedEvents = eventEmitter.emit.mock.calls.filter(
      ([eventName]) => eventName === 'rule-handler.failed',
    );
    expect(failedEvents).toHaveLength(0);
  });

  it('drops remaining queued rule groups after the first mid-queue media server outage', async () => {
    const executeMock: ExecuteMock = jest
      .fn()
      .mockResolvedValueOnce({ status: 'success' })
      .mockResolvedValueOnce({
        status: 'failed',
        failedPayload: {
          collectionName: 'Movies',
          identifier: { type: 'rulegroup', value: 2 },
        } as any,
        reason: 'media-server-unreachable',
      });

    const { service } = buildService(executeMock);

    service.enqueue({ ruleGroupId: 1 });
    service.enqueue({ ruleGroupId: 2 });
    service.enqueue({ ruleGroupId: 3 });

    await flushMicrotasks();
    await waitForNextTick();
    await flushMicrotasks();
    await waitForNextTick();
    await flushMicrotasks();

    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock).toHaveBeenNthCalledWith(1, 1, expect.any(AbortSignal));
    expect(executeMock).toHaveBeenNthCalledWith(2, 2, expect.any(AbortSignal));
    expect(service.getQueuedRuleGroupIds()).toEqual([]);
    expect(service.isProcessing()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'Media server became unreachable during queue execution. Dropping remaining queued rule groups.',
    );
  });

  it('does not log a queue-drain warning when the last executing rule fails from a media server outage', async () => {
    const executeMock: ExecuteMock = jest.fn().mockResolvedValue({
      status: 'failed',
      failedPayload: {
        collectionName: 'Movies',
        identifier: { type: 'rulegroup', value: 1 },
      } as any,
      reason: 'media-server-unreachable',
    });

    const { service } = buildService(executeMock);

    service.enqueue({ ruleGroupId: 1 });

    await flushMicrotasks();
    await waitForNextTick();
    await flushMicrotasks();

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalledWith(
      'Media server became unreachable during queue execution. Dropping remaining queued rule groups.',
    );
  });

  it('clears queued work when stopProcessing is called', async () => {
    const executeMock: ExecuteMock = jest
      .fn()
      .mockResolvedValue({ status: 'success' });
    const { service } = buildService(executeMock);

    service.enqueue({ ruleGroupId: 1 });
    service.enqueue({ ruleGroupId: 2 });

    await service.stopProcessing();

    expect(service.getQueuedRuleGroupIds()).toHaveLength(0);
    expect(service.isProcessing()).toBe(false);
  });

  it('reports status correctly', async () => {
    const inFlight = createDeferred();
    const executeMock: ExecuteMock = jest.fn().mockImplementation(async () => {
      await inFlight.promise;
      return { status: 'success' };
    });
    const { service } = buildService(executeMock);

    expect(service.getStatus()).toEqual({
      processingQueue: false,
      executingRuleGroupId: null,
      pendingRuleGroupIds: [],
      queue: [],
    });

    service.enqueue({ ruleGroupId: 7 });
    await flushMicrotasks();
    const status = service.getStatus();
    expect(status.executingRuleGroupId).toBe(7);
    expect(status.pendingRuleGroupIds).toEqual([]);
    expect(status.queue).toHaveLength(0);

    // finish the in-flight job to avoid dangling work
    inFlight.resolve();
    await flushMicrotasks();
  });

  it('reports a rule group as pending while waiting for the execution lock', async () => {
    const lockDeferred = createDeferred();
    const release = jest.fn();
    const executeMock: ExecuteMock = jest
      .fn()
      .mockResolvedValue({ status: 'success' });

    const { service, executionLock, eventEmitter } = buildService(executeMock);
    jest.spyOn(executionLock, 'acquire').mockImplementation(async () => {
      await lockDeferred.promise;
      return release;
    });

    service.enqueue({ ruleGroupId: 11 });
    await flushMicrotasks();

    expect(service.getStatus()).toEqual({
      processingQueue: true,
      executingRuleGroupId: null,
      pendingRuleGroupIds: [11],
      queue: [],
    });
    expect(eventEmitter.emit.mock.calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.anything(),
          expect.objectContaining({
            data: expect.objectContaining({
              pendingRuleGroupIds: [11],
            }),
          }),
        ]),
      ]),
    );

    lockDeferred.resolve();
    await flushMicrotasks();
    await waitForNextTick();

    expect(service.getStatus()).toEqual({
      processingQueue: false,
      executingRuleGroupId: null,
      pendingRuleGroupIds: [],
      queue: [],
    });
    expect(executeMock).toHaveBeenCalledWith(11, expect.any(AbortSignal));
  });

  it('preserves an abort request while waiting for the execution lock', async () => {
    const lockDeferred = createDeferred();
    const release = jest.fn();
    const executeMock: ExecuteMock = jest
      .fn()
      .mockResolvedValue({ status: 'success' });

    const { service, executionLock } = buildService(executeMock);
    jest.spyOn(executionLock, 'acquire').mockImplementation(async () => {
      await lockDeferred.promise;
      return release;
    });

    service.enqueue({ ruleGroupId: 42 });
    await flushMicrotasks();

    service.stopProcessingRuleGroup(42);

    const abortController = (service as any).abortController as
      | AbortController
      | undefined;
    expect(abortController?.signal.aborted).toBe(true);
    expect(service.getStatus()).toEqual({
      processingQueue: true,
      executingRuleGroupId: null,
      pendingRuleGroupIds: [42],
      queue: [],
    });

    lockDeferred.resolve();
    await flushMicrotasks();

    expect(executeMock).toHaveBeenCalledWith(42, expect.any(AbortSignal));
  });
});
