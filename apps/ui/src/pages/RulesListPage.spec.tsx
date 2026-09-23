import { fireEvent, render, screen } from '../test-utils/render'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useMediaServerLibraries } from '../api/media-server'
import { useRuleGroups } from '../api/rules'
import type { IRuleGroup } from '../components/Rules/RuleGroup'
import { buildQuerySuccessResult } from '../test-utils/queryResults'
import { buildRuleGroup } from '../test-utils/ruleGroups'
import RulesListPage from './RulesListPage'

vi.mock('../api/media-server', () => ({ useMediaServerLibraries: vi.fn() }))
vi.mock('../api/rules', () => ({
  useRuleGroups: vi.fn(),
  useStopAllRuleExecution: () => ({ mutate: vi.fn() }),
}))
vi.mock('../contexts/taskstatus-context', () => ({
  useTaskStatusContext: () => ({ ruleHandlerRunning: false }),
}))
vi.mock('../components/Rules/RuleGroup', () => ({
  default: ({ group }: { group: IRuleGroup }) => (
    <div data-testid="rule-group">{group.name}</div>
  ),
}))

const cardNames = () =>
  screen.getAllByTestId('rule-group').map((card) => card.textContent)

describe('RulesListPage', () => {
  it('lists rule groups in creation order and re-sorts them from the sort control', () => {
    vi.mocked(useMediaServerLibraries).mockReturnValue(
      buildQuerySuccessResult([
        { id: 'library-1', title: 'Movies', type: 'movie' },
      ]),
    )
    // Answered out of creation order, so the default sort is observable.
    vi.mocked(useRuleGroups).mockReturnValue(
      buildQuerySuccessResult([
        buildRuleGroup({ id: 2, name: 'Zulu' }),
        buildRuleGroup({ id: 1, name: 'Alpha' }),
      ]),
    )

    render(
      <MemoryRouter>
        <RulesListPage />
      </MemoryRouter>,
    )

    expect(cardNames()).toEqual(['Alpha', 'Zulu'])

    fireEvent.change(screen.getByLabelText('Sort rules'), {
      target: { value: 'name.desc' },
    })

    expect(cardNames()).toEqual(['Zulu', 'Alpha'])
  })
})
