import {
  type MediaLibrarySortField,
  type MediaSortOrder,
} from '@maintainerr/contracts';

export const PLEX_BATCH_SIZE = {
  COLLECTION_MUTATION: 4,
  // PMS applies no container cap to /library/metadata (240 ids in one response
  // on 1.43.3), so this bounds only the request line: ~800 characters.
  METADATA_LOOKUP: 100,
} as const;

const PLEX_SORT_FIELDS: Partial<Record<MediaLibrarySortField, string>> = {
  airDate: 'originallyAvailableAt',
  rating: 'audienceRating',
  watchCount: 'viewCount',
  title: 'titleSort',
};

export function toPlexSort(
  sort?: MediaLibrarySortField,
  sortOrder?: MediaSortOrder,
): string | undefined {
  const field = sort ? PLEX_SORT_FIELDS[sort] : undefined;

  if (!field) {
    return undefined;
  }

  return `${field}:${sortOrder ?? 'asc'}`;
}
