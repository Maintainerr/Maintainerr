import { ExecutionLockService } from './execution-lock.service';

const defer = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

describe('ExecutionLockService', () => {
  let service: ExecutionLockService;

  beforeEach(() => {
    service = new ExecutionLockService();
  });

  it('serializes acquires on the same key until released', async () => {
    const releaseFirst = await service.acquire('shared');

    let secondAcquired = false;
    const secondAcquire = (async () => {
      const releaseSecond = await service.acquire('shared');
      secondAcquired = true;
      releaseSecond();
    })();

    // second should still be waiting
    await Promise.resolve();
    expect(secondAcquired).toBe(false);

    releaseFirst();
    await secondAcquire;

    expect(secondAcquired).toBe(true);
  });

  it('allows different keys to acquire independently', async () => {
    const releaseFirst = await service.acquire('key-a');

    let secondAcquired = false;
    const releaseSecond = await service.acquire('key-b');
    secondAcquired = true;

    expect(secondAcquired).toBe(true);

    releaseFirst();
    releaseSecond();
  });

  it('does not block subsequent acquires after release', async () => {
    const release = await service.acquire('shared');
    release();

    const deferred = defer();
    let acquiredAfterRelease = false;

    const waiter = (async () => {
      const releaseAgain = await service.acquire('shared');
      acquiredAfterRelease = true;
      releaseAgain();
      deferred.resolve();
    })();

    await deferred.promise;
    await waiter;

    expect(acquiredAfterRelease).toBe(true);
  });
});
