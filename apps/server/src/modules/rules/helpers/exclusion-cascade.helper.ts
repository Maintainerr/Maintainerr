import { Exclusion } from '../entities/exclusion.entities';

/**
 * Pre-computed sets used to decide whether a media item is covered by any
 * exclusion. Cascade is driven by `exclusion.type` and `exclusion.mediaServerId`
 * - the `parent` field on Exclusion records the entry point of the original
 * exclusion request (used by bulk find/delete) and must not be used as a
 * cascade key for typed rows, or a single-episode exclusion would skip every
 * other episode of the same show (issue #2858).
 *
 * `legacyParentIds` retains the pre-#2858 `parent`-based cascade for rows
 * where `type` is still null/undefined. ExclusionTypeCorrectorService backfills
 * types best-effort at startup, but it can be skipped when the media server
 * is unreachable, so we keep the old (loose) cascade for legacy rows rather
 * than silently dropping their descendants from exclusion until the next
 * successful corrector run.
 */
export interface ExclusionCascadeSets {
  excludedMediaServerIds: Set<string>;
  excludedShowIds: Set<string>;
  excludedSeasonIds: Set<string>;
  legacyParentIds: Set<string>;
}

export function buildExclusionCascadeSets(
  exclusions: Pick<Exclusion, 'mediaServerId' | 'type' | 'parent'>[],
): ExclusionCascadeSets {
  const excludedMediaServerIds = new Set<string>();
  const excludedShowIds = new Set<string>();
  const excludedSeasonIds = new Set<string>();
  const legacyParentIds = new Set<string>();

  for (const exclusion of exclusions) {
    if (!exclusion.mediaServerId) continue;
    excludedMediaServerIds.add(exclusion.mediaServerId);

    if (exclusion.type === 'show') {
      excludedShowIds.add(exclusion.mediaServerId);
    } else if (exclusion.type === 'season') {
      excludedSeasonIds.add(exclusion.mediaServerId);
    } else if (exclusion.type == null && exclusion.parent) {
      legacyParentIds.add(String(exclusion.parent));
    }
  }

  return {
    excludedMediaServerIds,
    excludedShowIds,
    excludedSeasonIds,
    legacyParentIds,
  };
}

export function isMediaItemExcluded(
  cascade: ExclusionCascadeSets,
  item: {
    id: string | number;
    parentId?: string | number;
    grandparentId?: string | number;
  },
): boolean {
  const id = item.id?.toString();
  if (id && cascade.excludedMediaServerIds.has(id)) {
    return true;
  }

  const parentId = item.parentId?.toString();
  if (
    parentId &&
    (cascade.excludedSeasonIds.has(parentId) ||
      cascade.excludedShowIds.has(parentId) ||
      cascade.legacyParentIds.has(parentId))
  ) {
    return true;
  }

  const grandparentId = item.grandparentId?.toString();
  if (
    grandparentId &&
    (cascade.excludedShowIds.has(grandparentId) ||
      cascade.legacyParentIds.has(grandparentId))
  ) {
    return true;
  }

  return false;
}
