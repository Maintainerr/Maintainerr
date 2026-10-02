import { ArrLookupCache } from './arr-lookup-cache';

// Let the eviction callback (chained on the resolved promise) run.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('ArrLookupCache', () => {
  it('resolves a key once and reuses the result for later callers', async () => {
    const cache = new ArrLookupCache();
    const fetch = jest.fn().mockResolvedValue('series');

    const first = await cache.memoize('k', fetch);
    const second = await cache.memoize('k', fetch);

    expect(first).toBe('series');
    expect(second).toBe('series');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('evicts a failed lookup so the next caller retries', async () => {
    const cache = new ArrLookupCache();
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(undefined) // transient failure
      .mockResolvedValueOnce('series'); // recovers
    const evictOnFailure = (value: unknown) => value === undefined;

    const first = await cache.memoize('k', fetch, evictOnFailure);
    await flushMicrotasks();
    const second = await cache.memoize('k', fetch, evictOnFailure);

    expect(first).toBeUndefined();
    expect(second).toBe('series');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
