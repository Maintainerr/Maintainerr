import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchContext, {
  SearchContextProvider,
} from '../../contexts/search-context'
import Layout from './index'

const navigate = vi.fn()

vi.mock('./NavBar', () => ({
  default: () => null,
}))

vi.mock('../../utils/ApiHandler', () => ({
  default: vi.fn((path: string) => {
    if (path === '/settings/test/setup') {
      return Promise.resolve(true)
    }

    if (path === '/settings') {
      return Promise.resolve({})
    }

    return Promise.resolve(undefined)
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    Outlet: () => null,
    useLocation: () => ({ pathname: '/rules' }),
    useNavigate: () => navigate,
    useNavigation: () => ({ state: 'idle' }),
    useRouteError: () => undefined,
  }
})

const SearchProbe = () => {
  const { search } = React.useContext(SearchContext)

  return <span data-testid="search-text">{search.text}</span>
}

describe('Layout search', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigate.mockReset()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('keeps the full typed value and only updates shared search after the debounce', () => {
    render(
      <SearchContextProvider>
        <Layout />
        <SearchProbe />
      </SearchContextProvider>,
    )

    const input = screen.getByPlaceholderText('Search') as HTMLInputElement

    fireEvent.change(input, { target: { value: 'm' } })
    fireEvent.change(input, { target: { value: 'mo' } })
    fireEvent.change(input, { target: { value: 'mov' } })
    fireEvent.change(input, { target: { value: 'movie' } })

    expect(input.value).toBe('movie')
    expect(screen.getByTestId('search-text').textContent).toBe('')

    act(() => {
      vi.advanceTimersByTime(999)
    })

    expect(screen.getByTestId('search-text').textContent).toBe('')

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByTestId('search-text').textContent).toBe('movie')
    expect(navigate).toHaveBeenCalledWith('/overview')
  })
})
