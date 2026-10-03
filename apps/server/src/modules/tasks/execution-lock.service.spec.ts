import { ExecutionLockService } from './execution-lock.service';

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

  it('returns null from tryAcquire when the key is already locked', async () => {
    const release = await service.acquire('shared');

    expect(service.tryAcquire('shared')).toBeNull();

    release();
  });

  it('allows tryAcquire after a previous acquire was released', async () => {
    const release = await service.acquire('shared');
    release();

    const next = service.tryAcquire('shared');
    expect(next).not.toBeNull();
    next?.();
  });

  describe('acquireWithin', () => {
    it('acquires once the current holder releases within the timeout', async () => {
      const releaseFirst = await service.acquire('shared');
      const waiting = service.acquireWithin('shared', 1000);

      releaseFirst();
      const release = await waiting;

      expect(release).not.toBeNull();
      release?.();
    });

    it('gives up when the holder outlasts the timeout', async () => {
      const releaseFirst = await service.acquire('shared');

      await expect(service.acquireWithin('shared', 10)).resolves.toBeNull();

      releaseFirst();
    });

    it('does not starve a later waiter when several give up in a row', async () => {
      const releaseFirst = await service.acquire('shared');

      const abandoned = [
        service.acquireWithin('shared', 10),
        service.acquireWithin('shared', 10),
      ];
      // A caller that queued before the timeouts fired and is still waiting.
      const patient = service.acquireWithin('shared', 5000);

      await expect(Promise.all(abandoned)).resolves.toEqual([null, null]);

      releaseFirst();
      const release = await patient;

      expect(release).not.toBeNull();
      release?.();
      expect(service.tryAcquire('shared')).not.toBeNull();
    });

    it('leaves the lock usable after giving up', async () => {
      const releaseFirst = await service.acquire('shared');
      await service.acquireWithin('shared', 10);

      // The abandoned waiter still owns its place in the queue, so it has to
      // release its own turn or every later caller blocks behind it forever.
      releaseFirst();
      const release = await service.acquireWithin('shared', 1000);

      expect(release).not.toBeNull();
      release?.();
      expect(service.tryAcquire('shared')).not.toBeNull();
    });
  });
});
