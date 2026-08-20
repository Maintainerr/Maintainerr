import { Injectable } from '@nestjs/common';

export const RULES_COLLECTIONS_EXECUTION_LOCK_KEY = 'rules-collections-lock';

// Overlay runs, resets and reverts all read and write the same posters and
// backups, so they take turns on this one.
export const OVERLAY_EXECUTION_LOCK_KEY = 'overlay-lock';

/*
 * A lightweight async lock for coordinating exclusive execution between tasks.
 * Acquiring returns a release function that must be called in a finally block.
 */
@Injectable()
export class ExecutionLockService {
  private readonly locks = new Map<string, Promise<void>>();
  private ruleQueueProcessing = false;

  /**
   * True while the rule queue is draining, which spans the gaps between the
   * per-run locks below. Kept here so the collections side can see it without
   * depending on the rules module.
   */
  public isRuleQueueProcessing(): boolean {
    return this.ruleQueueProcessing;
  }

  public setRuleQueueProcessing(processing: boolean): void {
    this.ruleQueueProcessing = processing;
  }

  public tryAcquire(key: string): (() => void) | null {
    if (this.locks.has(key)) {
      return null;
    }

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.locks.set(key, current);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();

      if (this.locks.get(key) === current) {
        this.locks.delete(key);
      }
    };
  }

  /**
   * Queue behind the current holder, but give up after `timeoutMs` and return
   * null. For request-scoped callers that would rather wait out a short run
   * than fail immediately, without hanging on a run that lasts hours.
   */
  public async acquireWithin(
    key: string,
    timeoutMs: number,
  ): Promise<(() => void) | null> {
    // `acquire` claims its place in the chain synchronously, so abandoning it
    // on timeout would block every later waiter. Keep the promise and release
    // its turn the moment it comes up instead.
    const queued = this.acquire(key);

    let timer: NodeJS.Timeout | undefined;
    const release = await Promise.race([
      queued,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    clearTimeout(timer);

    if (release) {
      return release;
    }

    void queued.then((late) => late());
    return null;
  }

  public async acquire(key: string): Promise<() => void> {
    const prior = this.locks.get(key);

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Store `current` directly so the release callback below can recognise
    // its own entry by reference and delete it on release. Storing the
    // chained promise (prior.then(() => current)) instead would leak the
    // entry forever - `tryAcquire` checks `locks.has(key)` and would never
    // return non-null again, which is the root cause of #2799.
    this.locks.set(key, current);

    // Wait for the earlier holder to release before handing the caller the
    // releaser. Each acquire only sees the single direct predecessor, but
    // because every caller follows this same await-prior pattern, we still
    // get a FIFO chain across an arbitrary number of waiters.
    if (prior !== undefined) {
      await prior;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();

      if (this.locks.get(key) === current) {
        this.locks.delete(key);
      }
    };
  }
}
