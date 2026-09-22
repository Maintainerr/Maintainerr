import type { MediaLibrary } from '@maintainerr/contracts'
import { describe, expect, it } from 'vitest'
import type { IRuleGroup } from './RuleGroup'
import { getRuleGroupSortConfig, sortRuleGroups } from './ruleGroupSort'

const group = (overrides: Partial<IRuleGroup>): IRuleGroup => ({
  id: 1,
  name: 'Group',
  description: '',
  libraryId: '1',
  isActive: true,
  collectionId: 1,
  rules: [],
  useRules: true,
  dataType: 'movie',
  ...overrides,
})

const libraries: MediaLibrary[] = [
  { id: '1', title: 'Movies', type: 'movie' },
  { id: '2', title: 'Anime', type: 'show' },
]

const groups = [
  group({ id: 1, name: 'Zulu', libraryId: '1', isActive: false }),
  group({ id: 2, name: 'Alpha', libraryId: '2' }),
  group({ id: 3, name: 'Mike', libraryId: 'gone' }),
  group({ id: 4, name: 'Bravo', libraryId: '1' }),
]

const namesOf = (sorted: IRuleGroup[]) => sorted.map((item) => item.name)

describe('sortRuleGroups', () => {
  it('keeps creation order by default and reverses it for newest first', () => {
    expect(getRuleGroupSortConfig().defaultValue).toBe('created.asc')
    expect(namesOf(sortRuleGroups(groups, undefined, libraries))).toEqual([
      'Zulu',
      'Alpha',
      'Mike',
      'Bravo',
    ])
    expect(
      namesOf(
        sortRuleGroups(
          groups,
          { sort: 'created', sortOrder: 'desc' },
          libraries,
        ),
      ),
    ).toEqual(['Bravo', 'Mike', 'Alpha', 'Zulu'])
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
