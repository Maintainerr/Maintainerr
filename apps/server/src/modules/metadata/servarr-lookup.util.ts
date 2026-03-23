// NOTE: extend this list when Servarr adds support for additional external-ID lookups.
export const SERVARR_LOOKUP_PROVIDER_KEYS = ['tmdb', 'tvdb'] as const;

export type ServarrLookupProviderKey =
  (typeof SERVARR_LOOKUP_PROVIDER_KEYS)[number];

export interface ServarrLookupCandidate {
  providerKey: ServarrLookupProviderKey;
  id: number;
}

export function isServarrLookupProviderKey(
  providerKey: string,
): providerKey is ServarrLookupProviderKey {
  return SERVARR_LOOKUP_PROVIDER_KEYS.includes(
    providerKey as ServarrLookupProviderKey,
  );
}

export function formatServarrLookupCandidates(
  lookupCandidates: ServarrLookupCandidate[],
): string {
  return lookupCandidates
    .map(
      (candidate) => `${candidate.providerKey.toUpperCase()}:${candidate.id}`,
    )
    .join(', ');
}

export async function findServarrLookupMatch<T>(
  lookupCandidates: ServarrLookupCandidate[],
  lookups: Record<
    ServarrLookupProviderKey,
    (id: number) => Promise<T | undefined>
  >,
): Promise<{ candidate: ServarrLookupCandidate; result: T } | undefined> {
  for (const candidate of lookupCandidates) {
    const result = await lookups[candidate.providerKey](candidate.id);
    if (result !== undefined) {
      return { candidate, result };
    }
  }

  return undefined;
}
