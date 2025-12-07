import { RuleExecutorJobManagerService } from './rule-executor-job-manager.service';

type ExecuteMock = jest.Mock<Promise<void>, [number, AbortSignal]>;

const createDeferred = () => {
  let resolve: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve: resolve! };
};

describe('RuleExecutorJobManagerService', () => {
  const logger = {
    setContext: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as const;

  const buildService = (executeMock?: ExecuteMock) => {
    const ruleExecutorService = {
      executeForRuleGroups:
        executeMock ?? (jest.fn().mockResolvedValue(undefined) as ExecuteMock),
    };

    return {
      service: new RuleExecutorJobManagerService(
        ruleExecutorService as any,
        logger as any,
      ),
      ruleExecutorService,
    };
  };

  const flushMicrotasks = async () => Promise.resolve();

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
    const executeMock: ExecuteMock = jest
      .fn()
      .mockImplementation(async () => executionDeferred.promise);

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

  it('clears queued work when stopProcessing is called', async () => {
    const executeMock: ExecuteMock = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService(executeMock);

    service.enqueue({ ruleGroupId: 1 });
    service.enqueue({ ruleGroupId: 2 });

    await service.stopProcessing();

    expect(service.getQueuedRuleGroupIds()).toHaveLength(0);
    expect(service.isProcessing()).toBe(false);
  });

  it('reports status correctly', async () => {
    const inFlight = createDeferred();
    const executeMock: ExecuteMock = jest
      .fn()
      .mockImplementation(() => inFlight.promise);
    const { service } = buildService(executeMock);

    expect(service.getStatus()).toEqual({
      processingQueue: false,
      executingRuleGroupId: null,
      queueLength: 0,
    });

    service.enqueue({ ruleGroupId: 7 });
    await flushMicrotasks();
    const status = service.getStatus();
    expect(status.executingRuleGroupId).toBe(7);
    expect(status.queueLength).toBeGreaterThanOrEqual(0);

    // finish the in-flight job to avoid dangling work
    inFlight.resolve();
    await flushMicrotasks();
  });
});
