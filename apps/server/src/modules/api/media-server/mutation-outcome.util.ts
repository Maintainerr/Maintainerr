import { isAxiosError } from 'axios';
import type { CollectionMutationOutcome } from './media-server.interface';

/** Why a mutation did not succeed. See CollectionMutationOutcome. */
export type MutationFailure = 'refused' | 'unknown';

/**
 * Whether a failed mutation was refused by the server or simply never answered.
 *
 * A 4xx means the server processed the request and declined it, so its state is
 * established. Anything else - no response at all (timeout, dropped connection,
 * DNS) or a 5xx raised while it was handling the write - leaves the outcome
 * genuinely unknown, and the write may still have been applied.
 *
 * isAxiosError duck-types on the error's own flag, so it also matches the
 * separate axios instance the Jellyfin SDK resolves (`instanceof AxiosError`
 * does not).
 */
export const classifyMutationError = (error: unknown): MutationFailure => {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && status >= 400 && status < 500
    ? 'refused'
    : 'unknown';
};

/** Record ids on the list their failure belongs to. */
export const recordMutationFailure = (
  outcome: CollectionMutationOutcome,
  itemIds: string[],
  failure: MutationFailure,
): void => {
  (failure === 'refused' ? outcome.refused : outcome.unknown).push(...itemIds);
};

/**
 * Every id the mutation did not confirm, refused or unknown alike. For the
 * callers that only report and retry, where the two are handled the same way.
 */
export const unconfirmedIds = (
  outcome: CollectionMutationOutcome,
): Set<string> => new Set([...outcome.refused, ...outcome.unknown]);
