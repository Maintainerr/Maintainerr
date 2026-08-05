import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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
