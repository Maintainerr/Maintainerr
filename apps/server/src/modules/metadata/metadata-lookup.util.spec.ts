import {
  findMetadataLookupMatch,
  formatMetadataLookupCandidates,
  MetadataLookupCandidate,
} from './metadata-lookup.util';

describe('formatMetadataLookupCandidates', () => {
  it('formats multiple candidates comma-separated', () => {
    const candidates: MetadataLookupCandidate[] = [
      { providerKey: 'tmdb', id: 771 },
      { providerKey: 'tvdb', id: 202 },
    ];
    expect(formatMetadataLookupCandidates(candidates)).toBe(
      'TMDB:771, TVDB:202',
    );
  });
});

describe('findMetadataLookupMatch', () => {
  it('returns the first matching candidate', async () => {
    const candidates: MetadataLookupCandidate[] = [
      { providerKey: 'tmdb', id: 771 },
      { providerKey: 'tvdb', id: 202 },
    ];
    const result = await findMetadataLookupMatch(candidates, {
      tmdb: async (id) => ({ title: 'Movie', tmdbId: id }),
    });
    expect(result).toEqual({
      candidate: { providerKey: 'tmdb', id: 771 },
      result: { title: 'Movie', tmdbId: 771 },
    });
  });

  it('skips candidates with no matching lookup function', async () => {
    const candidates: MetadataLookupCandidate[] = [
      { providerKey: 'tvdb', id: 202 },
      { providerKey: 'tmdb', id: 771 },
    ];
    const result = await findMetadataLookupMatch(candidates, {
      tmdb: async (id) => ({ title: 'Movie', tmdbId: id }),
    });
    expect(result).toEqual({
      candidate: { providerKey: 'tmdb', id: 771 },
      result: { title: 'Movie', tmdbId: 771 },
    });
  });

  it('skips candidates whose lookup returns undefined', async () => {
    const candidates: MetadataLookupCandidate[] = [
      { providerKey: 'tmdb', id: 999 },
      { providerKey: 'tvdb', id: 202 },
    ];
    const result = await findMetadataLookupMatch(candidates, {
      tmdb: async () => undefined,
      tvdb: async (id) => ({ title: 'Show', tvdbId: id }),
    });
    expect(result).toEqual({
      candidate: { providerKey: 'tvdb', id: 202 },
      result: { title: 'Show', tvdbId: 202 },
    });
  });

  it('skips candidates whose lookup throws', async () => {
    const candidates: MetadataLookupCandidate[] = [
      { providerKey: 'tmdb', id: 771 },
      { providerKey: 'tvdb', id: 202 },
    ];
    const result = await findMetadataLookupMatch(candidates, {
      tmdb: async () => {
        throw new Error('API down');
      },
      tvdb: async (id) => ({ title: 'Show', tvdbId: id }),
    });
    expect(result).toEqual({
      candidate: { providerKey: 'tvdb', id: 202 },
      result: { title: 'Show', tvdbId: 202 },
    });
  });

  it('returns undefined when no candidate matches', async () => {
    const candidates: MetadataLookupCandidate[] = [
      { providerKey: 'tmdb', id: 771 },
    ];
    const result = await findMetadataLookupMatch(candidates, {
      tmdb: async () => undefined,
    });
    expect(result).toBeUndefined();
  });
});
