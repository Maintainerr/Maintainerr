import type { MediaLibrary } from '@maintainerr/contracts'
import { describe, expect, it } from 'vitest'
import { buildRuleGroup } from '../../test-utils/ruleGroups'
import type { IRuleGroup } from './RuleGroup'
import { getRuleGroupSortConfig, sortRuleGroups } from './ruleGroupSort'

const libraries: MediaLibrary[] = [
  { id: '1', title: 'Movies', type: 'movie' },
  { id: '2', title: 'Anime', type: 'show' },
]

// Deliberately not in id order, so the creation sort has work to do.
const groups = [
  buildRuleGroup({ id: 4, name: 'Zulu', libraryId: '1', isActive: false }),
  buildRuleGroup({ id: 2, name: 'Alpha', libraryId: '2' }),
  buildRuleGroup({ id: 3, name: 'Mike', libraryId: 'gone' }),
  buildRuleGroup({ id: 1, name: 'Bravo', libraryId: '1' }),
]

const namesOf = (sorted: IRuleGroup[]) => sorted.map((item) => item.name)

describe('sortRuleGroups', () => {
  it('sorts by creation order through the default option, newest first reversed', () => {
    const { defaultValue, options } = getRuleGroupSortConfig()
    const byDefault = options.find((option) => option.value === defaultValue)

    expect(defaultValue).toBe('created.asc')
    expect(
      namesOf(sortRuleGroups(groups, byDefault?.sortParams, libraries)),
    ).toEqual(['Bravo', 'Alpha', 'Mike', 'Zulu'])
    expect(
      namesOf(
        sortRuleGroups(
          groups,
          { sort: 'created', sortOrder: 'desc' },
          libraries,
        ),
      ),
    ).toEqual(['Zulu', 'Mike', 'Alpha', 'Bravo'])
  })

  it('orders by name in both directions', () => {
    expect(
      namesOf(
        sortRuleGroups(groups, { sort: 'name', sortOrder: 'asc' }, libraries),
      ),
    ).toEqual(['Alpha', 'Bravo', 'Mike', 'Zulu'])
    expect(
      namesOf(
        sortRuleGroups(groups, { sort: 'name', sortOrder: 'desc' }, libraries),
      ),
    ).toEqual(['Zulu', 'Mike', 'Bravo', 'Alpha'])
  })

  it('orders by library title, ties by name, and an unknown library last', () => {
    expect(
      namesOf(
        sortRuleGroups(
          groups,
          { sort: 'library', sortOrder: 'asc' },
          libraries,
        ),
      ),
    ).toEqual(['Alpha', 'Bravo', 'Zulu', 'Mike'])
    expect(
      namesOf(
        sortRuleGroups(
          groups,
          { sort: 'library', sortOrder: 'desc' },
          libraries,
        ),
      ),
    ).toEqual(['Bravo', 'Zulu', 'Alpha', 'Mike'])
  })

  it('puts active rules first without reordering them otherwise', () => {
    expect(
      namesOf(
        sortRuleGroups(
          groups,
          { sort: 'active', sortOrder: 'desc' },
          libraries,
        ),
      ),
    ).toEqual(['Alpha', 'Mike', 'Bravo', 'Zulu'])
  })
})
