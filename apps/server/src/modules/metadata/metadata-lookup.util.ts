export interface MetadataLookupCandidate {
  providerKey: string;
  id: number;
}

export function formatMetadataLookupCandidates(
  lookupCandidates: MetadataLookupCandidate[],
): string {
  return lookupCandidates
    .map(
      (candidate) => `${candidate.providerKey.toUpperCase()}:${candidate.id}`,
    )
    .join(', ');
}

export async function findMetadataLookupMatch<T>(
  lookupCandidates: MetadataLookupCandidate[],
  lookups: Record<string, (id: number) => Promise<T | undefined>>,
): Promise<{ candidate: MetadataLookupCandidate; result: T } | undefined> {
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
