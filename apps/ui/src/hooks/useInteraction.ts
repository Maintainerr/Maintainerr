import { useSyncExternalStore } from 'react'

const UPDATE_INTERVAL = 1000 // Throttle updates to prevent flip flopping

// Subscription management
const listeners = new Set<() => void>()

// Module-level state
let isTouch = typeof window !== 'undefined' && 'ontouchstart' in window
let lastTouchUpdate = Date.now()
let isSubscribed = false

const shouldUpdate = (): boolean => lastTouchUpdate + UPDATE_INTERVAL < Date.now()

const setTouch = (value: boolean): void => {
  if (isTouch !== value) {
    isTouch = value
    listeners.forEach((cb) => cb())
  }
}

const onMouseMove = (): void => {
  if (isTouch && shouldUpdate()) {
    setTimeout(() => {
      if (shouldUpdate()) setTouch(false)
    }, UPDATE_INTERVAL)
  }
}

const onTouchStart = (): void => {
  lastTouchUpdate = Date.now()
  if (!isTouch) setTouch(true)
}

const onPointerMove = (e: PointerEvent): void => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    onTouchStart()
  } else {
    onMouseMove()
  }
}

const setupListeners = (): void => {
  if (isSubscribed || typeof window === 'undefined') return
  isSubscribed = true

  if ('ontouchstart' in window) {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
  } else {
    window.addEventListener('pointerdown', onPointerMove, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
  }
}

const cleanupListeners = (): void => {
  if (!isSubscribed || typeof window === 'undefined') return
  isSubscribed = false

  if ('ontouchstart' in window) {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('touchstart', onTouchStart)
  } else {
    window.removeEventListener('pointerdown', onPointerMove)
    window.removeEventListener('pointermove', onPointerMove)
  }
}

const interactionStore = {
  subscribe: (callback: () => void): (() => void) => {
    listeners.add(callback)
    setupListeners()
    return () => {
      listeners.delete(callback)
      if (listeners.size === 0) cleanupListeners()
    }
  },
  getSnapshot: (): boolean => isTouch,
  getServerSnapshot: (): boolean => false,
}

const useInteraction = (): boolean =>
  useSyncExternalStore(
    interactionStore.subscribe,
    interactionStore.getSnapshot,
    interactionStore.getServerSnapshot,
  )

export default useInteraction
