import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollection } from '../api/collections'
import { useRuleGroupForCollection } from '../api/rules'
import type { ICollection } from '../components/Collection'
import type { IRuleGroup } from '../components/Rules/RuleGroup'
import { buildQuerySuccessResult } from '../test-utils/queryResults'
import CollectionDetailPage from './CollectionDetailPage'

const navigate = vi.fn()
const useLocation = vi.fn()
const useParams = vi.fn()

const buildCollection = (
  overrides: Partial<ICollection> = {},
): ICollection => ({
  id: 42,
  libraryId: 'library-1',
  title: 'Regression Test Collection',
  isActive: true,
  overlayEnabled: false,
  type: 'movie',
  arrAction: 0,
  media: [],
  manualCollection: false,
  manualCollectionName: '',
  addDate: new Date('2026-01-01T00:00:00.000Z'),
  handledMediaAmount: 0,
  lastDurationInSeconds: 0,
  keepLogsForMonths: 0,
  ...overrides,
})

const buildRuleGroup = (
  overrides: Partial<IRuleGroup> = {},
): IRuleGroup => ({
  id: 1,
  name: 'Regression Test Rule Group',
  description: '',
  libraryId: 'library-1',
  isActive: true,
  collectionId: 42,
  rules: [],
  useRules: false,
  dataType: 'movie',
  ...overrides,
})

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
    useCollectionMock.mockReturnValue(
      buildQuerySuccessResult(buildCollection()),
    )
    useRuleGroupForCollectionMock.mockReturnValue(
      buildQuerySuccessResult(buildRuleGroup()),
    )
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
