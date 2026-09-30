type PrefetchRoute = (path: string) => Promise<void>

// router.tsx registers its route walker here, so the components it renders
// can warm a route without importing router.tsx, which broke hot updates.
let walker: PrefetchRoute = () => Promise.resolve()

export const registerPrefetch = (prefetch: PrefetchRoute) => {
  walker = prefetch
}

export const prefetchRoute: PrefetchRoute = (path) => walker(path)

// Hover, focus and touch handlers that warm a route before it is clicked.
export const prefetchHandlers = (path: string, enabled = true) => {
  const prefetch = enabled ? () => void prefetchRoute(path) : undefined
  return { onMouseEnter: prefetch, onFocus: prefetch, onTouchStart: prefetch }
}
