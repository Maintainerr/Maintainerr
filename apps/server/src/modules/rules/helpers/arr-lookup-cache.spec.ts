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

  it('shares a single in-flight promise across concurrent callers', async () => {
    const cache = new ArrLookupCache();
    // Stays pending until we release it, so all three calls overlap.
    let release: (value: string) => void;
    const fetch = jest
      .fn()
      .mockReturnValue(new Promise<string>((r) => (release = r)));

    const all = Promise.all([
      cache.memoize('k', fetch),
      cache.memoize('k', fetch),
      cache.memoize('k', fetch),
    ]);
    release('series');

    expect(await all).toEqual(['series', 'series', 'series']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps separate entries per key', async () => {
    const cache = new ArrLookupCache();
    const fetch = jest.fn((key: string) => Promise.resolve(key));

    await cache.memoize('a', () => fetch('a'));
    await cache.memoize('b', () => fetch('b'));

    expect(fetch).toHaveBeenCalledTimes(2);
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

  it('retains a successful lookup so it is not re-fetched', async () => {
    const cache = new ArrLookupCache();
    const fetch = jest.fn().mockResolvedValue('series');
    const evictOnFailure = (value: unknown) => value === undefined;

    await cache.memoize('k', fetch, evictOnFailure);
    await flushMicrotasks();
    await cache.memoize('k', fetch, evictOnFailure);

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
