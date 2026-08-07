// jsdom ships no IntersectionObserver, so any component that observes one
// throws on mount. A specless stub keeps those mounts working; a spec that
// needs entries stubs the global itself with a version it can drive.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = ''
    readonly scrollMargin = ''
    readonly thresholds: readonly number[] = []
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }

  globalThis.IntersectionObserver = NoopIntersectionObserver
}
