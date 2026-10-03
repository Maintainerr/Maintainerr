import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// findBy/waitFor give up after 1 s by default, which a page render can exceed
// on a loaded machine (CI, parallel workers, a small ARM box) without anything
// being broken. A real miss still fails, only later.
configure({ asyncUtilTimeout: 5000 })

// Unmounts whatever a test rendered. Registered globally via `setupFiles` so no
// spec has to remember it, and so a new spec cannot reintroduce the flake below
// by forgetting.
//
// A React tree left mounted keeps the scheduler holding work, and anything it
// runs after vitest tears the jsdom environment down throws "window is not
// defined". That surfaces as an unhandled error rather than a test failure, so
// it fails the whole run while every test still reports green.
afterEach(() => {
  cleanup()
})
