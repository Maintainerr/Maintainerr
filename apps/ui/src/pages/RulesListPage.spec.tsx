import { fireEvent, render, screen } from '../test-utils/render'
import { describe, expect, it, vi } from 'vitest'
import { useMediaServerLibraries } from '../api/media-server'
import { useRuleGroups, useStopAllRuleExecution } from '../api/rules'
import type { IRuleGroup } from '../components/Rules/RuleGroup'
import { buildQuerySuccessResult } from '../test-utils/queryResults'
import RulesListPage from './RulesListPage'

vi.mock('../api/media-server', () => ({ useMediaServerLibraries: vi.fn() }))
vi.mock('../api/rules', () => ({
  useRuleGroups: vi.fn(),
  useStopAllRuleExecution: vi.fn(),
}))
vi.mock('../contexts/taskstatus-context', () => ({
  useTaskStatusContext: () => ({ ruleHandlerRunning: false }),
}))
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom',
  )),
  useNavigate: () => vi.fn(),
}))
vi.mock('../components/Rules/RuleGroup', () => ({
  default: ({ group }: { group: IRuleGroup }) => (
    <div data-testid="rule-group">{group.name}</div>
  ),
}))

const group = (id: number, name: string): IRuleGroup => ({
  id,
  name,
  description: '',
  libraryId: '1',
  isActive: true,
  collectionId: id,
  rules: [],
  useRules: true,
  dataType: 'movie',
})

const cardNames = () =>
  screen.getAllByTestId('rule-group').map((card) => card.textContent)

describe('RulesListPage', () => {
  it('lists rule groups in creation order and re-sorts them from the sort control', () => {
    vi.mocked(useMediaServerLibraries).mockReturnValue(
      buildQuerySuccessResult([{ id: '1', title: 'Movies', type: 'movie' }]),
    )
    vi.mocked(useRuleGroups).mockReturnValue(
      buildQuerySuccessResult([group(1, 'Zulu'), group(2, 'Alpha')]),
    )
    vi.mocked(useStopAllRuleExecution).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useStopAllRuleExecution>)

    render(<RulesListPage />)

    expect(cardNames()).toEqual(['Zulu', 'Alpha'])

    fireEvent.change(screen.getByLabelText('Sort rules'), {
      target: { value: 'name.asc' },
    })

    expect(cardNames()).toEqual(['Alpha', 'Zulu'])
  })
})
