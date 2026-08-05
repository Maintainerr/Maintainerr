import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../test-utils/queryClient'
import GetApiHandler, { PostApiHandler } from '../../utils/ApiHandler'
import type { IAddModal } from './interfaces'
import AddModal from './index'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('../../utils/ApiHandler', () => ({
  default: vi.fn(),
  PostApiHandler: vi.fn(),
}))

let queryClient: QueryClient
let invalidateQueries: ReturnType<typeof vi.spyOn>

const renderModal = (props: Partial<IAddModal> = {}) => {
  const onCancel = props.onCancel ?? vi.fn()
  const onSubmit = props.onSubmit ?? vi.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <AddModal
        mediaServerId="m1"
        type="movie"
        modalType="add"
        {...props}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    </QueryClientProvider>,
  )

  return { onCancel, onSubmit }
}

beforeEach(() => {
  // The hooks set their own retry count, so only the delay can be flattened.
  queryClient = createTestQueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  })
  invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
  navigate.mockReset()
})

afterEach(() => {
  queryClient.clear()
})

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

  const renderExclude = () => renderModal({ modalType: 'exclude' })

  const exclusionPost = () =>
    postApiHandlerMock.mock.calls.find(
      (call) => call[0] === '/rules/exclusion',
    )?.[1] as { collectionId?: number } | undefined

  beforeEach(() => {
    getApiHandlerMock.mockReset()
    postApiHandlerMock.mockReset()
  })

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

  const collections = [
    { id: 1, title: 'Show collection', type: 'show' },
    { id: 2, title: 'Season collection', type: 'season' },
    { id: 3, title: 'Episode collection', type: 'episode' },
    { id: 4, title: 'Movie collection', type: 'movie' },
  ]

  const stubApi = (children: unknown[] = []) => {
    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.startsWith('/media-server/meta/'))
        return Promise.resolve(children)
      if (url.startsWith('/collections')) return Promise.resolve(collections)
      return Promise.resolve(undefined)
    }) as typeof GetApiHandler)
  }

  const optionTitles = () =>
    Array.from(
      (
        screen.getByRole('combobox', {
          name: 'Collection',
        }) as HTMLSelectElement
      ).options,
    ).map((option) => option.text)

  beforeEach(() => {
    getApiHandlerMock.mockReset()
    postApiHandlerMock.mockReset()
    stubApi()
    postApiHandlerMock.mockResolvedValue(undefined as never)
  })

  // Every failure used to be swallowed by a bare catch, so a refused add
  // looked identical to a successful one (#3381).
  it('shows why the server refused the action', async () => {
    postApiHandlerMock.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 502'), {
        isAxiosError: true,
        response: {
          data: { message: 'The media server refused 1 of 1 item(s)' },
        },
      }),
    )
    const { onSubmit } = renderModal({ mediaServerId: 'show-1', type: 'show' })

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    expect(
      await screen.findByText('The media server refused 1 of 1 item(s)'),
    ).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // A season or episode can only go into a collection of that type, and the
  // list narrows as the picker does.
  it('offers only the collection types the current selection can produce', async () => {
    stubApi([{ id: 'season-1', title: 'Season 1', index: 1 }])
    renderModal({ mediaServerId: 'show-1', type: 'show' })

    await screen.findByRole('option', { name: 'Show collection' })
    expect(optionTitles()).toEqual([
      'Show collection',
      'Season collection',
      'Episode collection',
    ])

    // Narrowing to a season drops the show collection without a refetch.
    fireEvent.change(screen.getByRole('combobox', { name: 'Seasons' }), {
      target: { value: 'season-1' },
    })

    await waitFor(() =>
      expect(optionTitles()).toEqual([
        'Season collection',
        'Episode collection',
      ]),
    )
  })

  it('offers only movie collections for a movie', async () => {
    renderModal({ mediaServerId: 'movie-1', type: 'movie' })

    await screen.findByRole('option', { name: 'Movie collection' })
    expect(optionTitles()).toEqual(['Movie collection'])
  })

  // A collection only accepts items from its own library, so the read is
  // scoped to the one the item is in.
  it('reads collections for the item library only', async () => {
    renderModal({ mediaServerId: 'movie-1', type: 'movie', libraryId: '3' })

    await screen.findByRole('option', { name: 'Movie collection' })
    expect(getApiHandlerMock).toHaveBeenCalledWith('/collections?libraryId=3')
  })

  // The empty list used to say "Please select a collection" with nothing to
  // select, and left Submit enabled.
  it('explains an empty collection list instead of asking for a choice', async () => {
    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.startsWith('/media-server/meta/')) return Promise.resolve([])
      if (url.startsWith('/collections')) return Promise.resolve([])
      return Promise.resolve(undefined)
    }) as typeof GetApiHandler)

    renderModal({ mediaServerId: 'show-1', type: 'show' })

    const submit = (await screen.findByRole('button', {
      name: 'Submit',
    })) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(true))
    expect(
      screen.getByText(/No collection in this library can take this item/),
    ).toBeTruthy()
    expect(screen.queryByText('Please select a collection')).toBeNull()
  })

  // A failed read leaves the same empty picker as an empty library, but the
  // cause is different - and Submit has nothing to send either way.
  it('reports a failed collection read instead of an empty picker', async () => {
    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.startsWith('/media-server/meta/')) return Promise.resolve([])
      return Promise.reject(new Error('Network Error'))
    }) as typeof GetApiHandler)

    renderModal({ mediaServerId: 'movie-1', type: 'movie' })

    expect(await screen.findByText('Network Error')).toBeTruthy()
    expect(
      screen.queryByText(/No collection in this library can take this item/),
    ).toBeNull()
    const submit = screen.getByRole('button', {
      name: 'Submit',
    }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  // A -1 context id let the server act on the show itself, so a season
  // collection received a show id and Plex answered 400 (#3381).
  it('identifies "all seasons" by the show id rather than a sentinel', async () => {
    renderModal({ mediaServerId: 'show-1', type: 'show' })

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(postApiHandlerMock).toHaveBeenCalledWith(
        '/collections/media/add',
        {
          mediaId: 'show-1',
          context: { id: 'show-1', type: 'show' },
          collectionId: 1,
          action: 0,
        },
      ),
    )
  })
})
