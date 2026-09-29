import { describe, expect, it, vi } from 'vitest'
import { prefetchRoute } from './router'

const loaded = vi.hoisted(() => [] as string[])

vi.mock('./components/Layout', () => ({
  default: () => null,
  LayoutErrorBoundary: () => null,
}))
vi.mock('./components/Overview', () => ({ default: () => null }))
vi.mock('./components/Overlays', () => ({ default: () => null }))
vi.mock('./components/Settings', () => ({ default: () => null }))
vi.mock('./components/Settings/Metadata', () => {
  loaded.push('metadata')
  return { default: () => null }
})
vi.mock('./components/Settings/Servarr/ServarrSettings', () => {
  loaded.push('servarr')
  return { default: () => null }
})

describe('prefetchRoute', () => {
  // Each page module loads once, so one test walks both paths in order.
  it('warms the page a service path renders', async () => {
    await prefetchRoute('/services/metadata')
    expect(loaded).toEqual(['metadata'])

    await prefetchRoute('/services/radarr')
    expect(loaded).toEqual(['metadata', 'servarr'])
  })
})
