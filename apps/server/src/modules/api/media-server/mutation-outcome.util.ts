import { isAxiosError } from 'axios';
import type { CollectionMutationOutcome } from './media-server.interface';

/**
 * Whether a failed mutation was refused by the server or simply never answered.
 *
 * A 4xx means the server processed the request and declined it, so its state is
 * established. Anything else - no response at all (timeout, dropped connection,
 * DNS) or a 5xx raised while it was handling the write - leaves the outcome
 * genuinely unknown, and the write may still have been applied. The two must not
 * be recorded the same way: a collection add that was applied but not answered
 * leaves a server child no local row accounts for, which the manual child import
 * then adopts as a hand-added member.
 *
 * isAxiosError duck-types on the error's own flag, so it also matches the
 * separate axios instance the Jellyfin SDK resolves (`instanceof AxiosError`
 * does not).
 */
export const classifyMutationError = (
  error: unknown,
): 'refused' | 'unknown' => {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && status >= 400 && status < 500
    ? 'refused'
    : 'unknown';
};

/**
 * Every id the mutation did not confirm, refused or unknown alike. For the
 * callers that only report and retry, where the two are handled the same way.
 */
export const unconfirmedIds = (
  outcome: CollectionMutationOutcome,
): Set<string> => new Set([...outcome.refused, ...outcome.unknown]);

/** Accumulates per-item outcomes for a batched collection mutation. */
export class MutationOutcomeBuilder {
  private readonly refused: string[] = [];
  private readonly unknown: string[] = [];

  add(itemIds: string[], failure: 'refused' | 'unknown'): void {
    if (failure === 'refused') {
      this.refused.push(...itemIds);
    } else {
      this.unknown.push(...itemIds);
    }
  }

  addError(itemIds: string[], error: unknown): void {
    this.add(itemIds, classifyMutationError(error));
  }

  get outcome(): CollectionMutationOutcome {
    return { refused: this.refused, unknown: this.unknown };
  }

  get failedCount(): number {
    return this.refused.length + this.unknown.length;
  }
}
