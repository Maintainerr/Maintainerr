type PrefetchRoute = (path: string) => Promise<void>

// router.tsx registers its route walker here, so the components it renders can
// warm a route without importing it back. That import cycle made every hot
// update of Layout or Settings fail and reload the page.
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
