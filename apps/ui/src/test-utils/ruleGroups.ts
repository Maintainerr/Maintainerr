import type { IRuleGroup } from '../components/Rules/RuleGroup'

export const buildRuleGroup = (
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
