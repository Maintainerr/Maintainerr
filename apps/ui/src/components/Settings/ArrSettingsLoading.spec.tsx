import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, type RenderResult } from '../../test-utils/render'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../test-utils/queryClient'
import { ServarrSettings } from './Servarr/ServarrSettings'

// The page embeds ExclusionTagSettings, which reads global settings via
// TanStack Query, so renders need a QueryClient in the tree.
const renderWithClient = (ui: ReactElement): RenderResult =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      {ui}
    </QueryClientProvider>,
  )

const getApiHandler = vi.fn()
const deleteApiHandler = vi.fn()
const logClientError = vi.fn()

vi.mock('../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
  GetApiHandler: (url: string) => getApiHandler(url),
  DeleteApiHandler: (url: string) => deleteApiHandler(url),
}))

vi.mock('../../utils/ClientLogger', () => ({
  logClientError: (...args: unknown[]) => logClientError(...args),
}))

// ServarrSettings is one component for every *arr, so one service covers it.
describe.each([{ label: 'Radarr', service: 'radarr' }] as const)(
  '$label settings loading',
  ({ label, service }) => {
    beforeEach(() => {
      getApiHandler.mockReset()
      deleteApiHandler.mockReset()
      logClientError.mockReset()
    })

    it('says the list failed to load instead of offering only Add', async () => {
      getApiHandler.mockRejectedValue(new Error('Request failed'))

      renderWithClient(<ServarrSettings service={service} />)

      expect(
        await screen.findByText('The server list could not be loaded.'),
      ).toBeTruthy()
      expect(
        screen.queryByRole('button', { name: `Add ${label} server` }),
      ).toBeNull()
    })
  },
)
