import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../test-utils/createDeferred'
import { createTestQueryClient } from '../../../test-utils/queryClient'
import NotificationSettings from './index'

const getApiHandler = vi.fn()
const deleteApiHandler = vi.fn()
const postApiHandler = vi.fn()

vi.mock('../../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
  DeleteApiHandler: (url: string) => deleteApiHandler(url),
  PostApiHandler: (url: string, payload: unknown) =>
    postApiHandler(url, payload),
}))

const agents = [
  {
    name: 'gotify',
    friendlyName: 'Gotify',
    options: [{ field: 'url', type: 'text', required: true, extraInfo: '' }],
  },
]
const types = [{ id: 1, title: 'Added' }]
const existing = {
  id: 1,
  name: 'Existing',
  agent: 'gotify',
  enabled: false,
  types: [1],
  aboutScale: 3,
  options: { url: 'http://gotify.local' },
}

const renderNotifications = () =>
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <NotificationSettings />
    </QueryClientProvider>,
  )

const answer = (lists: Record<string, unknown>) =>
  getApiHandler.mockImplementation((url: string) => {
    if (url in lists) return Promise.resolve(lists[url])
    throw new Error(`Unexpected request: ${url}`)
  })

describe('NotificationSettings', () => {
  beforeEach(() => {
    getApiHandler.mockReset()
    deleteApiHandler.mockReset()
    postApiHandler
      .mockReset()
      .mockResolvedValue({ code: 1, status: 'OK', message: 'Success' })
    answer({
      '/notifications/configurations': [existing],
      '/notifications/agents': agents,
      '/notifications/types': types,
    })
  })

  it('shows each agent as a collapsed card, labelled when disabled', async () => {
    renderNotifications()

    expect(await screen.findByText('Existing')).toBeTruthy()
    expect(screen.getByText('Disabled')).toBeTruthy()
    expect(screen.queryByDisplayValue('Existing')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByDisplayValue('http://gotify.local')).toBeTruthy()
  })

  it('waits for the agent lists before showing any card', async () => {
    const agentsRequest = createDeferred<typeof agents>()
    getApiHandler.mockImplementation((url: string) =>
      url === '/notifications/agents'
        ? agentsRequest.promise
        : Promise.resolve(url === '/notifications/types' ? types : []),
    )

    renderNotifications()
    await waitFor(() => {
      expect(getApiHandler).toHaveBeenCalledWith('/notifications/types')
    })
    expect(screen.queryByRole('button', { name: 'Add Agent' })).toBeNull()

    agentsRequest.resolve(agents)
    expect(
      await screen.findByRole('button', { name: 'Add Agent' }),
    ).toBeTruthy()
  })

  it('saves a new agent from a draft card and confirms it on the saved card', async () => {
    renderNotifications()
    fireEvent.click(await screen.findByRole('button', { name: 'Add Agent' }))

    fireEvent.change(screen.getByLabelText('Name *'), {
      target: { value: 'New agent' },
    })
    fireEvent.change(screen.getByLabelText('Agent *'), {
      target: { value: 'gotify' },
    })
    fireEvent.change(await screen.findByLabelText('URL *'), {
      target: { value: 'http://new.local' },
    })
    answer({
      '/notifications/configurations': [
        existing,
        { ...existing, id: 2, name: 'New agent', enabled: true },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(postApiHandler).toHaveBeenCalledWith(
      '/notifications/configuration/add',
      expect.objectContaining({
        name: 'New agent',
        agent: 'gotify',
        options: { url: 'http://new.local' },
      }),
    )
    expect(screen.getByRole('button', { name: 'Add Agent' })).toBeTruthy()
  })

  it('deletes an agent only after confirming, and says when it could not', async () => {
    deleteApiHandler.mockResolvedValue({ code: 0 })
    renderNotifications()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(deleteApiHandler).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Are you sure?' }))

    expect(deleteApiHandler).toHaveBeenCalledWith(
      '/notifications/configuration/1',
    )
    expect(
      await screen.findByText('Failed to delete notification agent.'),
    ).toBeTruthy()
  })
})
