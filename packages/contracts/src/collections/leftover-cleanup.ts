import { MediaItemType } from '../media-server/enums'
import { ServarrAction } from './servarr-action'

/** Which folder a leftover cleanup would remove. */
export type LeftoverCleanupScope = 'movie' | 'series' | 'season'

/**
 * The folder an action strands, or undefined when it strands nothing.
 *
 * Only the actions that delete an item's files one at a time leave a folder
 * behind. A whole-entity delete (`DELETE /movie/{id}`, `DELETE /series/{id}`)
 * removes the folder in the *arr itself, and an episode-scope delete shares its
 * season folder with the episodes that are kept.
 *
 * The UI uses this to decide whether to offer the cleanup checkbox, and the
 * action handlers use it to decide whether to act. Keep it the single
 * definition so the two can never drift.
 */
export const leftoverCleanupScope = (
  type: MediaItemType,
  action: ServarrAction,
): LeftoverCleanupScope | undefined => {
  switch (action) {
    case ServarrAction.UNMONITOR_DELETE_ALL:
      if (type === 'movie') return 'movie'
      return type === 'show' ? 'series' : undefined
    case ServarrAction.UNMONITOR_DELETE_EXISTING:
      if (type === 'show') return 'series'
      return type === 'season' ? 'season' : undefined
    case ServarrAction.DELETE:
    case ServarrAction.DELETE_SHOW_IF_EMPTY:
      return type === 'season' ? 'season' : undefined
    default:
      return undefined
  }
}
