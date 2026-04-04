import { type MediaLibrarySortField, type MediaSortOrder } from '@maintainerr/contracts';

export const PLEX_BATCH_SIZE = {
  COLLECTION_MUTATION: 25,
} as const;

export const PLEX_PAGE_SIZE = {
  DEFAULT: 50,
} as const;

export const PLEX_SORT_FIELDS: Partial<Record<MediaLibrarySortField, string>> = {
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