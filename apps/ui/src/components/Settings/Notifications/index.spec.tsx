import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../test-utils/createDeferred'
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

describe('NotificationSettings', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    getApiHandler.mockReset()
    deleteApiHandler.mockReset()
    postApiHandler.mockReset()

    getApiHandler.mockImplementation((url: string) => {
      if (url === '/notifications/configurations') {
        return Promise.resolve([])
      }

      if (url === '/notifications/agents') {
        return Promise.resolve([])
      }

      if (url === '/notifications/types') {
        return Promise.resolve([])
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    postApiHandler.mockImplementation((url: string) => {
      if (url === '/notifications/configuration/add') {
        return Promise.resolve({
          code: 1,
          status: 'OK',
          message: 'Success',
        })
      }

      if (url === '/notifications/test') {
        return Promise.resolve('Success')
      }

      throw new Error(`Unexpected request: ${url}`)
    })
  })

  it('keeps the modal shell visible while notification agent data is loading', async () => {
    const agentsRequest = createDeferred<
      Array<{
        name: string
        friendlyName: string
        options: []
      }>
    >()
    const typesRequest = createDeferred<Array<{ title: string; id: number }>>()

    getApiHandler.mockImplementation((url: string) => {
      if (url === '/notifications/configurations') {
        return Promise.resolve([])
      }

      if (url === '/notifications/agents') {
        return agentsRequest.promise
      }

      if (url === '/notifications/types') {
        return typesRequest.promise
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    render(<NotificationSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Agent' }))

    expect(
      await screen.findByRole('dialog', { name: 'New Notification Agent' }),
    ).toBeTruthy()

    expect(
      screen
        .getByRole('button', { name: 'Save Changes' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Test Connection' })
        .hasAttribute('disabled'),
    ).toBe(true)

    agentsRequest.resolve([{ name: '-', friendlyName: '', options: [] }])
    typesRequest.resolve([{ id: 1, title: 'Added' }])
  })

  it('shows inline page feedback after saving a notification agent', async () => {
    getApiHandler.mockImplementation((url: string) => {
      if (url === '/notifications/configurations') {
        return Promise.resolve([])
      }

      if (url === '/notifications/agents') {
        return Promise.resolve([
          {
            name: 'webhook',
            friendlyName: 'Webhook',
            options: [],
          },
        ])
      }

      if (url === '/notifications/types') {
        return Promise.resolve([{ id: 1, title: 'Added' }])
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    render(<NotificationSettings />)

    fireEvent.click(screen.getByRole('button', { name: 'Add Agent' }))

    expect(
      await screen.findByRole('dialog', { name: 'New Notification Agent' }),
    ).toBeTruthy()

    fireEvent.change(await screen.findByLabelText('Name *'), {
      target: { value: 'Webhook agent' },
    })
    fireEvent.change(screen.getByLabelText('Agent *'), {
      target: { value: '1' },
    })

    const saveButton = screen.getByRole('button', { name: 'Save Changes' })

    await waitFor(() => {
      expect(saveButton.hasAttribute('disabled')).toBe(false)
    })

    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(postApiHandler).toHaveBeenCalledWith(
        '/notifications/configuration/add',
        expect.objectContaining({
          name: 'Webhook agent',
          agent: 'webhook',
        }),
      )
    })

    expect(await screen.findByText('Notification agent saved')).toBeTruthy()
  })
})
