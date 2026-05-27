import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GetApiHandler, { PostApiHandler } from '../../utils/ApiHandler'
import AddModal from './index'

const invalidateQueries = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return { ...actual, useQueryClient: () => ({ invalidateQueries }) }
})

vi.mock('../../utils/ApiHandler', () => ({
  default: vi.fn(),
  PostApiHandler: vi.fn(),
}))

describe('AddModal — global exclusion warning', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)
  const postApiHandlerMock = vi.mocked(PostApiHandler)

  const scopedStatus = {
    excludedFrom: [
      { label: 'Archive Queue', targetPath: '/collections/9/exclusions' },
      { label: 'Stale Movies', targetPath: '/collections/7/exclusions' },
    ],
    manuallyAddedTo: [],
  }

  // Route GetApiHandler by URL; `fetchMaintainerrStatusDetails` calls through
  // this same mock, so no separate mock is needed for the status helper.
  const stubApi = (status: unknown) => {
    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.includes('/maintainerr-status')) return Promise.resolve(status)
      if (url.startsWith('/media-server/meta/'))
        return Promise.resolve({ title: 'Mock Charlie' })
      if (url.startsWith('/collections')) return Promise.resolve([])
      return Promise.resolve(undefined)
    }) as typeof GetApiHandler)
    postApiHandlerMock.mockResolvedValue(undefined as never)
  }

  const renderExclude = () =>
    render(
      <AddModal
        mediaServerId="m1"
        type="movie"
        modalType="exclude"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

  const exclusionPost = () =>
    postApiHandlerMock.mock.calls.find(
      (call) => call[0] === '/rules/exclusion',
    )?.[1] as { collectionId?: number } | undefined

  beforeEach(() => {
    getApiHandlerMock.mockReset()
    postApiHandlerMock.mockReset()
  })
  afterEach(() => cleanup())

  it('Add + all collections, item has scoped exclusions: warns with item — rule-group links, then Proceed submits a global exclusion', async () => {
    stubApi(scopedStatus)
    renderExclude()

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    await screen.findByText('Confirmation Required')
    // each scoped exclusion is listed as "<item> — <linked rule group>"
    expect(
      screen.getByRole('link', { name: 'Archive Queue' }).getAttribute('href'),
    ).toBe('/collections/9/exclusions')
    expect(
      screen.getByRole('link', { name: 'Stale Movies' }).getAttribute('href'),
    ).toBe('/collections/7/exclusions')
    expect(screen.getAllByText(/Mock Charlie/).length).toBeGreaterThan(0)
    // not submitted until confirmed
    expect(postApiHandlerMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    await waitFor(() => expect(exclusionPost()).toBeDefined())
    expect(exclusionPost()?.collectionId).toBeUndefined() // global
  })

  it('Remove + all collections: no warning, submits directly', async () => {
    stubApi(scopedStatus)
    renderExclude()

    fireEvent.change(await screen.findByRole('combobox', { name: 'Action' }), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(exclusionPost()).toBeDefined())
    expect(screen.queryByText('Confirmation Required')).toBeNull()
  })

  it('Add + all collections, no scoped exclusions: no warning, submits', async () => {
    stubApi({ excludedFrom: [{ label: 'Global' }], manuallyAddedTo: [] })
    renderExclude()

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(exclusionPost()).toBeDefined())
    expect(screen.queryByText('Confirmation Required')).toBeNull()
  })

  it('Add + all collections, warning prefetch fails: submits instead of blocking', async () => {
    // The status read rejects; the warning can't be built, but the exclusion
    // the user asked for must still go through.
    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.includes('/maintainerr-status'))
        return Promise.reject(new Error('boom'))
      if (url.startsWith('/media-server/meta/'))
        return Promise.resolve({ title: 'Mock Charlie' })
      if (url.startsWith('/collections')) return Promise.resolve([])
      return Promise.resolve(undefined)
    }) as typeof GetApiHandler)
    postApiHandlerMock.mockResolvedValue(undefined as never)
    renderExclude()

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(exclusionPost()).toBeDefined())
    expect(exclusionPost()?.collectionId).toBeUndefined() // global
    expect(screen.queryByText('Confirmation Required')).toBeNull()
  })
})
