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
    const onSubmit = vi.fn()

    render(
      <AddModal
        mediaServerId="show-1"
        type="show"
        modalType="add"
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }))

    expect(
      await screen.findByText('The media server refused 1 of 1 item(s)'),
    ).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // A season or episode can only go into a collection of that type, and the
  // list is refetched as the picker narrows.
  it('offers only the collection types the current selection can produce', async () => {
    render(
      <AddModal
        mediaServerId="show-1"
        type="show"
        modalType="add"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    await screen.findByRole('button', { name: 'Submit' })

    const requested = getApiHandlerMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith('/collections'))

    expect(requested).toEqual([
      '/collections?typeId=show',
      '/collections?typeId=season',
      '/collections?typeId=episode',
    ])
  })

  // The empty list used to say "Please select a collection" with nothing to
  // select, and left Submit enabled.
  it('explains an empty collection list instead of asking for a choice', async () => {
    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.startsWith('/media-server/meta/')) return Promise.resolve([])
      if (url.startsWith('/collections')) return Promise.resolve([])
      return Promise.resolve(undefined)
    }) as typeof GetApiHandler)

    render(
      <AddModal
        mediaServerId="show-1"
        type="show"
        modalType="add"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const submit = (await screen.findByRole('button', {
      name: 'Submit',
    })) as HTMLButtonElement
    await waitFor(() => expect(submit.disabled).toBe(true))
    expect(
      screen.getByText(/No collection in this library can take this item/),
    ).toBeTruthy()
    expect(screen.queryByText('Please select a collection')).toBeNull()
  })

  // A slow read for the wider selection used to land last and re-offer
  // collection types the current selection cannot fill.
  it('ignores a collection read the selection has moved past', async () => {
    let releaseWide: (value: unknown) => void = () => {}
    const wide = new Promise((resolve) => {
      releaseWide = resolve
    })

    getApiHandlerMock.mockImplementation(((url: string) => {
      if (url.startsWith('/media-server/meta/'))
        return Promise.resolve([
          { id: 'season-1', title: 'Season 1', index: 1 },
        ])
      // The show read only happens for the wider "all seasons" selection.
      if (url.startsWith('/collections?typeId=show'))
        return wide.then(() => [{ id: 1, title: 'Show collection' }])
      if (url.startsWith('/collections?typeId=season'))
        return Promise.resolve([{ id: 2, title: 'Season collection' }])
      if (url.startsWith('/collections?typeId=episode'))
        return Promise.resolve([{ id: 3, title: 'Episode collection' }])
      return Promise.resolve(undefined)
    }) as typeof GetApiHandler)

    render(
      <AddModal
        mediaServerId="show-1"
        type="show"
        modalType="add"
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    // Narrow to a season while the wider read is still outstanding.
    fireEvent.change(await screen.findByRole('combobox', { name: 'Seasons' }), {
      target: { value: 'season-1' },
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: 'Show collection' }),
      ).toBeNull(),
    )

    releaseWide(undefined)

    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Season collection' }),
      ).toBeTruthy(),
    )
    expect(screen.queryByRole('option', { name: 'Show collection' })).toBeNull()
  })

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
