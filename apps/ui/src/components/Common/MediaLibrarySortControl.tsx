import {
  compareMediaItemsBySort,
  type CollectionMediaSortParams,
  type MediaItem,
  type MediaLibrary,
  type MediaLibrarySortKey,
  type MediaLibrarySortParams,
  type MediaSortOrder,
} from '@maintainerr/contracts'
import { useState } from 'react'
import { Select } from '../Forms/Select'
import { SmallLoadingSpinner } from './LoadingSpinner'

const defaultSortValue = ''
const defaultOverviewSortValue: MediaLibrarySortKey = 'title.asc'
const titleAscendingSortLabel = 'Title (A-Z) Ascending'

type SortParams = {
  sort: string
  sortOrder: MediaSortOrder
}

interface SortOption<TSortParams extends SortParams = MediaLibrarySortParams> {
  value: string
  label: string
  sortParams?: TSortParams
}

interface SortConfig<TSortParams extends SortParams = MediaLibrarySortParams> {
  defaultValue: string
  options: SortOption<TSortParams>[]
}

const createMediaLibrarySortOption = (
  value: MediaLibrarySortKey,
  label: string,
): SortOption<MediaLibrarySortParams> => {
  const [sort, sortOrder] = value.split('.') as [
    MediaLibrarySortParams['sort'],
    MediaSortOrder,
  ]

  return {
    value,
    label,
    sortParams: {
      sort,
      sortOrder,
    },
  }
}

const getSortOptionByValue = <TSortParams extends SortParams>(
  options: ReadonlyArray<SortOption<TSortParams>>,
  value: string,
) => {
  return options.find((option) => option.value === value)
}

const getResolvedSortOption = <TSortParams extends SortParams>(
  options: ReadonlyArray<SortOption<TSortParams>>,
  value: string,
  defaultValue: string,
): SortOption<TSortParams> => {
  return (
    getSortOptionByValue(options, value) ??
    getSortOptionByValue(options, defaultValue) ??
    options[0]!
  )
}

const getMediaLibrarySortOptions = (
  libraryType?: MediaLibrary['type'],
  {
    includeTitleAscending = true,
  }: {
    includeTitleAscending?: boolean
  } = {},
): Array<SortOption<MediaLibrarySortParams>> => {
  const airDateLabel =
    libraryType === 'show' ? 'First Air Date' : 'Release Date'

  const options: Array<SortOption<MediaLibrarySortParams>> = []

  if (includeTitleAscending) {
    options.push(
      createMediaLibrarySortOption('title.asc', titleAscendingSortLabel),
    )
  }

  options.push(
    createMediaLibrarySortOption('title.desc', 'Title (Z-A) Descending'),
    createMediaLibrarySortOption('airDate.desc', `${airDateLabel} Descending`),
    createMediaLibrarySortOption('airDate.asc', `${airDateLabel} Ascending`),
    createMediaLibrarySortOption('rating.desc', 'Rating Descending'),
    createMediaLibrarySortOption('rating.asc', 'Rating Ascending'),
    createMediaLibrarySortOption('watchCount.desc', 'Most Watched'),
    createMediaLibrarySortOption('watchCount.asc', 'Least Watched'),
  )

  return options
}

export const getMediaLibrarySortConfig = (
  libraryType?: MediaLibrary['type'],
): SortConfig<MediaLibrarySortParams> => {
  return {
    defaultValue: defaultOverviewSortValue,
    options: [
      createMediaLibrarySortOption(
        defaultOverviewSortValue,
        titleAscendingSortLabel,
      ),
      ...getMediaLibrarySortOptions(libraryType, {
        includeTitleAscending: false,
      }),
      createMediaLibrarySortOption('manual.desc', 'Manual Added First'),
      createMediaLibrarySortOption('excluded.desc', 'Excluded First'),
    ],
  }
}

export const getCollectionSortConfig = (
  libraryType?: MediaLibrary['type'],
  defaultLabel: string = 'Recently Excluded',
): SortConfig<MediaLibrarySortParams> => {
  return {
    defaultValue: defaultSortValue,
    options: [
      {
        value: defaultSortValue,
        label: defaultLabel,
      },
      ...getMediaLibrarySortOptions(libraryType),
    ],
  }
}

const collectionDeleteSoonestSortOption: SortOption<CollectionMediaSortParams> =
  {
    value: 'deleteSoonest.asc',
    label: 'Delete Soonest',
    sortParams: { sort: 'deleteSoonest', sortOrder: 'asc' },
  }

export const getCollectionMediaSortConfig = (
  libraryType?: MediaLibrary['type'],
  includeDeleteSoonest: boolean = false,
): SortConfig<CollectionMediaSortParams> => {
  const options = getCollectionSortConfig(
    libraryType,
    includeDeleteSoonest ? 'Delete Latest' : 'Recently Added',
  ).options.map((option) => ({
    value: option.value,
    label: option.label,
    sortParams: option.sortParams
      ? {
          sort: option.sortParams.sort,
          sortOrder: option.sortParams.sortOrder,
        }
      : undefined,
  }))

  const resolvedOptions = includeDeleteSoonest
    ? [collectionDeleteSoonestSortOption, ...options]
    : options

  return {
    defaultValue: includeDeleteSoonest
      ? collectionDeleteSoonestSortOption.value
      : defaultSortValue,
    options: resolvedOptions,
  }
}

export const sortMediaItems = (
  items: MediaItem[],
  sortParams?: MediaLibrarySortParams,
): MediaItem[] => {
  const resolvedSortParams: MediaLibrarySortParams = sortParams ?? {
    sort: 'title',
    sortOrder: 'asc',
  }

  return [...items].sort((leftItem, rightItem) =>
    compareMediaItemsBySort(
      leftItem,
      rightItem,
      resolvedSortParams.sort,
      resolvedSortParams.sortOrder,
    ),
  )
}

interface MediaLibrarySortControlProps {
  ariaLabel: string
  options: ReadonlyArray<{ value: string; label: string }>
  value: string
  onSortChange: (value: string) => void
  isLoading?: boolean
}

export const useMediaLibrarySort = <TSortParams extends SortParams>(
  config: SortConfig<TSortParams>,
) => {
  const [sortValue, setSortValue] = useState(config.defaultValue)
  const resolvedSortOption = getResolvedSortOption(
    config.options,
    sortValue,
    config.defaultValue,
  )

  const onSortChange = (nextValue: string) => {
    const nextSortOption = getSortOptionByValue(config.options, nextValue)
    if (!nextSortOption || nextSortOption.value === resolvedSortOption.value) {
      return undefined
    }

    setSortValue((currentValue) =>
      currentValue === nextSortOption.value
        ? currentValue
        : nextSortOption.value,
    )

    return nextSortOption
  }

  return {
    sortValue: resolvedSortOption.value,
    sortParams: resolvedSortOption.sortParams,
    onSortChange,
  }
}

export const MediaLibrarySortControl = ({
  ariaLabel,
  options,
  value,
  onSortChange,
  isLoading = false,
}: MediaLibrarySortControlProps) => {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <Select
          aria-label={ariaLabel}
          name="sort"
          value={value}
          onChange={(event) => onSortChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex min-h-6 min-w-6 items-center justify-end">
        {isLoading ? (
          <div role="status" aria-label="Loading sorted items">
            <SmallLoadingSpinner className="h-6 w-6" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
