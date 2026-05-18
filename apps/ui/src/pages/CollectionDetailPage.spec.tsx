import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollection } from '../api/collections'
import { useRuleGroupForCollection } from '../api/rules'
import CollectionDetailPage from './CollectionDetailPage'

const navigate = vi.fn()
const useLocation = vi.fn()
const useParams = vi.fn()

vi.mock('../api/collections', () => ({
  useCollection: vi.fn(),
}))

vi.mock('../api/rules', () => ({
  useRuleGroupForCollection: vi.fn(),
}))

vi.mock('../router', () => ({
  prefetchRoute: vi.fn(),
}))

vi.mock('../utils/ClientLogger', () => ({
  logClientError: vi.fn(),
}))

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    Outlet: () => <div data-testid="collection-detail-outlet" />,
    useLocation: () => useLocation(),
    useNavigate: () => navigate,
    useParams: () => useParams(),
  }
})

vi.mock(
  '../components/Collection/CollectionDetail/CollectionDetailControlRow',
  () => ({
    default: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="collection-detail-control-row">{children}</div>
    ),
  }),
)

vi.mock('../components/Common/LazyModalBoundary', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('../components/Common/LoadingSpinner', () => ({
  default: () => <div>loading</div>,
}))

vi.mock('../components/Common/TabbedLinks', () => ({
  default: () => <div data-testid="tabbed-links" />,
}))

describe('CollectionDetailPage', () => {
  const useCollectionMock = vi.mocked(useCollection)
  const useRuleGroupForCollectionMock = vi.mocked(useRuleGroupForCollection)

  beforeEach(() => {
    cleanup()
    navigate.mockReset()
    useLocation.mockReset()
    useParams.mockReset()
    useCollectionMock.mockReset()
    useRuleGroupForCollectionMock.mockReset()

    useLocation.mockReturnValue({ pathname: '/collections/42' })
    useParams.mockReturnValue({ id: '42' })
    useCollectionMock.mockReturnValue({
      data: {
        id: 42,
        title: 'Regression Test Collection',
        overlayEnabled: false,
      },
      error: null,
      isLoading: false,
    } as ReturnType<typeof useCollection>)
    useRuleGroupForCollectionMock.mockReturnValue({
      data: { useRules: false },
      isLoading: false,
    } as ReturnType<typeof useRuleGroupForCollection>)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders collection content once collection data is available', () => {
    render(<CollectionDetailPage />)

    expect(screen.getByText('Regression Test Collection')).toBeTruthy()
    expect(screen.getByTestId('tabbed-links')).toBeTruthy()
    expect(screen.getByTestId('collection-detail-outlet')).toBeTruthy()
  })
})
