import { t as globalT } from '@lingui/core/macro'
import type { MediaLibrary, MediaSortOrder } from '@maintainerr/contracts'
import { findLibraryTitle } from '../../hooks/useLibraryDisplay'
import { compareByName, compareLocalized } from '../../utils/collation'
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

export const sortRuleGroups = (
  groups: IRuleGroup[],
  sortParams: RuleGroupSortParams | undefined,
  libraries: MediaLibrary[] | undefined,
): IRuleGroup[] => {
  // Nothing selected keeps the order the API answers with: creation order.
  if (!sortParams) return groups
  const direction = sortParams.sortOrder === 'desc' ? -1 : 1

  return [...groups].sort((left, right) => {
    switch (sortParams.sort) {
      case 'created':
        return (left.id - right.id) * direction
      case 'name':
        return compareByName(left, right) * direction
      case 'library': {
        // A rule whose library is gone sorts last either way, and ties fall
        // back to the name, as the media sorts do.
        const leftTitle = findLibraryTitle(libraries, left.libraryId)
        const rightTitle = findLibraryTitle(libraries, right.libraryId)
        if (leftTitle === undefined && rightTitle === undefined) {
          return compareByName(left, right)
        }
        if (leftTitle === undefined) return 1
        if (rightTitle === undefined) return -1
        return (
          compareLocalized(leftTitle, rightTitle) * direction ||
          compareByName(left, right)
        )
      }
      case 'active':
        // Partitions only, keeping the incoming order.
        return ((left.isActive ? 1 : 0) - (right.isActive ? 1 : 0)) * direction
    }
  })
}
