import { Injectable } from '@nestjs/common';

export const RULES_COLLECTIONS_EXECUTION_LOCK_KEY = 'rules-collections-lock';

/*
 * A lightweight async lock for coordinating exclusive execution between tasks.
 * Acquiring returns a release function that must be called in a finally block.
 */
@Injectable()
export class ExecutionLockService {
  private readonly locks = new Map<string, Promise<void>>();

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

  public async acquire(key: string): Promise<() => void> {
    const prior = this.locks.get(key);

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Store `current` directly so the release callback below can recognise
    // its own entry by reference and delete it on release. Storing the
    // chained promise (prior.then(() => current)) instead would leak the
    // entry forever — `tryAcquire` checks `locks.has(key)` and would never
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
