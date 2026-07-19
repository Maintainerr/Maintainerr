import cacheManager, { Cache, DEFAULT_MAX_KEYS } from './cache';

describe('Cache key-count bound (#3284)', () => {
  const fill = (cache: Cache, count: number, prefix = 'k') => {
    for (let i = 0; i < count; i++) {
      cache.data.set(`${prefix}${i}`, { i });
    }
  };

  describe('bounded cache', () => {
    it('holds at the ceiling and evicts the oldest key first (FIFO)', () => {
      const cache = new Cache('t', 't', 'tmdb', { maxKeys: 3 });

      cache.data.set('a', 1);
      cache.data.set('b', 2);
      cache.data.set('c', 3);
      expect(cache.data.keys().sort()).toEqual(['a', 'b', 'c']);

      // Inserting a 4th key evicts the oldest ('a'), not a newer one.
      cache.data.set('d', 4);
      expect(cache.data.keys()).toHaveLength(3);
      expect(cache.data.has('a')).toBe(false);
      expect(cache.data.keys().sort()).toEqual(['b', 'c', 'd']);
      // The just-inserted value is retrievable.
      expect(cache.data.get('d')).toBe(4);
    });

    it('stays bounded no matter how many distinct keys are inserted', () => {
      const cache = new Cache('t', 't', 'tmdb', { maxKeys: 10 });
      fill(cache, 1000);
      expect(cache.data.keys()).toHaveLength(10);
      // FIFO: only the most-recent 10 survive.
      expect(cache.data.has('k999')).toBe(true);
      expect(cache.data.has('k989')).toBe(false);
    });

    it('overwriting an existing key reuses its slot (no eviction)', () => {
      const cache = new Cache('t', 't', 'tmdb', { maxKeys: 2 });
      cache.data.set('a', 1);
      cache.data.set('b', 2);
      cache.data.set('a', 99); // overwrite, not a new key

      expect(cache.data.keys()).toHaveLength(2);
      expect(cache.data.get('a')).toBe(99);
      expect(cache.data.has('b')).toBe(true);
    });

    it('preserves the ttl argument on set()', () => {
      const cache = new Cache('t', 't', 'tmdb', { maxKeys: 5 });
      cache.data.set('a', 1, 100);
      const ttl = cache.data.getTtl('a');
      expect(ttl).toBeGreaterThan(Date.now());
    });
  });

  describe('unbounded opt-out (maxKeys: 0)', () => {
    it('never evicts - for single-aggregate prefetch caches', () => {
      const cache = new Cache('t', 't', 'plexwatchhistory', {
        maxKeys: 0,
        useClones: false,
      });
      fill(cache, DEFAULT_MAX_KEYS + 25);
      expect(cache.data.keys()).toHaveLength(DEFAULT_MAX_KEYS + 25);
    });
  });

  describe('default configuration', () => {
    it('bounds a cache with no explicit maxKeys at DEFAULT_MAX_KEYS', () => {
      const cache = new Cache('t', 't', 'tmdb');
      fill(cache, DEFAULT_MAX_KEYS + 25);
      expect(cache.data.keys()).toHaveLength(DEFAULT_MAX_KEYS);
    });

    it('bounds the shared per-item response caches (tmdb, plexguid)', () => {
      for (const id of ['tmdb', 'plexguid'] as const) {
        const cache = cacheManager.getCache(id);
        cache.data.flushAll();
        fill(cache, DEFAULT_MAX_KEYS + 25);
        expect(cache.data.keys()).toHaveLength(DEFAULT_MAX_KEYS);
        cache.data.flushAll();
      }
    });

    it('leaves the prefetch-Map caches unbounded (plexwatchhistory, seerrrequests)', () => {
      for (const id of ['plexwatchhistory', 'seerrrequests'] as const) {
        const cache = cacheManager.getCache(id);
        cache.data.flushAll();
        fill(cache, DEFAULT_MAX_KEYS + 25);
        expect(cache.data.keys()).toHaveLength(DEFAULT_MAX_KEYS + 25);
        cache.data.flushAll();
      }
    });
  });

  describe('existing behaviour is preserved', () => {
    it('flushAll() skips persistent caches and clears the rest', () => {
      const tmdb = cacheManager.getCache('tmdb'); // persistent
      const plexguid = cacheManager.getCache('plexguid'); // not persistent
      tmdb.data.set('keep', 1);
      plexguid.data.set('drop', 1);

      cacheManager.flushAll();

      expect(tmdb.data.has('keep')).toBe(true);
      expect(plexguid.data.has('drop')).toBe(false);
      tmdb.data.flushAll();
    });
  });
});
