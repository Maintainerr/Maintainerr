import { t as globalT } from '@lingui/core/macro'
import type { MediaLibrary, MediaSortOrder } from '@maintainerr/contracts'
import {
  createSortOption,
  type SortConfig,
} from '../Common/MediaLibrarySortControl'
import type { IRuleGroup } from './RuleGroup'

type RuleGroupSortField = 'created' | 'name' | 'library' | 'active'

export interface RuleGroupSortParams {
  sort: RuleGroupSortField
  sortOrder: MediaSortOrder
}

// Creation order is what the page has always shown, so it stays the default.
export const getRuleGroupSortConfig = (): SortConfig<RuleGroupSortParams> => ({
  defaultValue: 'created.asc',
  options: [
    createSortOption('created.asc', globalT`Oldest First`),
    createSortOption('created.desc', globalT`Newest First`),
    createSortOption('name.asc', globalT`Name (A-Z) Ascending`),
    createSortOption('name.desc', globalT`Name (Z-A) Descending`),
    createSortOption('library.asc', globalT`Library (A-Z) Ascending`),
    createSortOption('library.desc', globalT`Library (Z-A) Descending`),
    createSortOption('active.desc', globalT`Active First`),
  ],
})

const compareByName = (left: IRuleGroup, right: IRuleGroup): number =>
  left.name.localeCompare(right.name)

export const sortRuleGroups = (
  groups: IRuleGroup[],
  sortParams: RuleGroupSortParams | undefined,
  libraries: MediaLibrary[] | undefined,
): IRuleGroup[] => {
  const { sort, sortOrder } = sortParams ?? {
    sort: 'created',
    sortOrder: 'asc',
  }
  const direction = sortOrder === 'desc' ? -1 : 1
  // Same lookup as the card's own library label, so the order matches it.
  const libraryTitles = new Map(
    (libraries ?? []).map((library) => [String(library.id), library.title]),
  )

  return [...groups].sort((left, right) => {
    switch (sort) {
      case 'created':
        return (left.id - right.id) * direction
      case 'name':
        return compareByName(left, right) * direction
      case 'library': {
        // Same invariants as the media sorts: a rule whose library is gone
        // sorts last either way, and ties fall back to name order.
        const leftTitle = libraryTitles.get(String(left.libraryId))
        const rightTitle = libraryTitles.get(String(right.libraryId))
        if (leftTitle === undefined && rightTitle === undefined) {
          return compareByName(left, right)
        }
        if (leftTitle === undefined) return 1
        if (rightTitle === undefined) return -1
        return (
          leftTitle.localeCompare(rightTitle) * direction ||
          compareByName(left, right)
        )
      }
      case 'active':
        // Partitions only, keeping the incoming order, like the status sorts.
        return ((left.isActive ? 1 : 0) - (right.isActive ? 1 : 0)) * direction
    }
  })
}
