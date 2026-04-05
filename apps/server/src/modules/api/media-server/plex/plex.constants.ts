import {
  type MediaLibrarySortField,
  type MediaSortOrder,
} from '@maintainerr/contracts';
import { PLEX_PAGE_SIZE } from '../../plex-api/plex-api.constants';

export const PLEX_BATCH_SIZE = {
  COLLECTION_MUTATION: 10,
} as const;

export const PLEX_SORT_FIELDS: Partial<Record<MediaLibrarySortField, string>> =
  {
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
