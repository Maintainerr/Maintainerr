export interface ServarrLookupCandidate {
  providerKey: string;
  id: number;
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
  lookups: Record<string, (id: number) => Promise<T | undefined>>,
): Promise<{ candidate: ServarrLookupCandidate; result: T } | undefined> {
  for (const candidate of lookupCandidates) {
    const lookup = lookups[candidate.providerKey];

    if (!lookup) {
      continue;
    }

    try {
      const result = await lookup(candidate.id);
      if (result !== undefined) {
        return { candidate, result };
      }
    } catch {
      continue;
    }
  }

  return undefined;
}
