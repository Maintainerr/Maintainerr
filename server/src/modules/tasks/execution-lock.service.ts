import { Injectable } from '@nestjs/common';

/*
 * A lightweight async lock for coordinating exclusive execution between tasks.
 * Acquiring returns a release function that must be called in a finally block.
 */
@Injectable()
export class ExecutionLockService {
  private readonly locks = new Map<string, Promise<void>>();

  public async acquire(key: string): Promise<() => void> {
    const prior = this.locks.get(key) ?? Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Chain so future acquirers wait for this one to release
    this.locks.set(
      key,
      prior.then(() => current),
    );

    // Wait for earlier holder, then return releaser
    await prior;

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
