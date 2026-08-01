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
const navigate = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return { ...actual, useQueryClient: () => ({ invalidateQueries }) }
})

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../../utils/ApiHandler', () => ({
  default: vi.fn(),
  PostApiHandler: vi.fn(),
}))

describe('AddModal - global exclusion warning', () => {
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

  const renderExclude = () => {
    const onCancel = vi.fn()
    render(
      <AddModal
        mediaServerId="m1"
        type="movie"
        modalType="exclude"
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    )
    return { onCancel }
  }

  const exclusionPost = () =>
    postApiHandlerMock.mock.calls.find(
      (call) => call[0] === '/rules/exclusion',
    )?.[1] as { collectionId?: number } | undefined

  beforeEach(() => {
    getApiHandlerMock.mockReset()
    postApiHandlerMock.mockReset()
    navigate.mockReset()
    invalidateQueries.mockReset()
  })
  afterEach(() => cleanup())

  it('Add + all collections, item has scoped exclusions: warns with item - rule-group links, then Proceed submits a global exclusion', async () => {
    stubApi(scopedStatus)
    renderExclude()

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    await screen.findByText('Confirmation Required')
    // each scoped exclusion is listed as "<item> - <linked rule group>"
    expect(screen.getByRole('button', { name: 'Archive Queue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stale Movies' })).toBeTruthy()
    expect(screen.getAllByText(/Mock Charlie/).length).toBeGreaterThan(0)
    // not submitted until confirmed
    expect(postApiHandlerMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Proceed' }))

    await waitFor(() => expect(exclusionPost()).toBeDefined())
    expect(exclusionPost()?.collectionId).toBeUndefined() // global
  })

  it('clicking a rule-group link navigates client-side (SPA) and closes the modal', async () => {
    stubApi(scopedStatus)
    const { onCancel } = renderExclude()

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    await screen.findByText('Confirmation Required')

    fireEvent.click(screen.getByRole('button', { name: 'Archive Queue' }))

    // SPA navigation + modal dismissed, and no exclusion submitted
    expect(navigate).toHaveBeenCalledWith('/collections/9/exclusions')
    expect(onCancel).toHaveBeenCalled()
    // destination is invalidated so it fetches fresh (replacing the old
    // full-reload's implicit cold load)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['collections'],
    })
    expect(postApiHandlerMock).not.toHaveBeenCalled()
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

describe('AddModal - context payload', () => {
  const getApiHandlerMock = vi.mocked(GetApiHandler)
  const postApiHandlerMock = vi.mocked(PostApiHandler)

  beforeEach(() => {
    getApiHandlerMock.mockReset()
    postApiHandlerMock.mockReset()
    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.startsWith('/media-server/meta/')) return Promise.resolve([])
      if (url === '/collections?typeId=season')
        return Promise.resolve([{ id: 4, title: 'Season cleanup' }])
      if (url.startsWith('/collections')) return Promise.resolve([])
      return Promise.resolve(undefined)
    }) as typeof GetApiHandler)
    postApiHandlerMock.mockResolvedValue(undefined as never)
  })
  afterEach(() => cleanup())

  // A -1 context id let the server act on the show itself, so a season
  // collection received a show id and Plex answered 400 (#3381).
  it('identifies "all seasons" by the show id rather than a sentinel', async () => {
    render(
      <AddModal
        mediaServerId="show-1"
        type="show"
        modalType="add"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(postApiHandlerMock).toHaveBeenCalledWith(
        '/collections/media/add',
        {
          mediaId: 'show-1',
          context: { id: 'show-1', type: 'show' },
          collectionId: 4,
          action: 0,
        },
      ),
    )
  })
})
