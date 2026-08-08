import { toast } from 'react-toastify'
import type { MediaActionOutcome } from '../components/Common/MediaActionModal'

export const formatItemCount = (count: number): string =>
  `${count} item${count === 1 ? '' : 's'}`

/** No collection id means the action covered every collection, so say which. */
export const bulkOutcomeVerb = ({
  action,
  collectionId,
}: Pick<MediaActionOutcome, 'action' | 'collectionId'>): string => {
  const everyCollection = collectionId === undefined

  return {
    'collection-add': 'added',
    'collection-remove': everyCollection
      ? 'removed from every collection'
      : 'removed',
    'exclusion-add': everyCollection ? 'excluded everywhere' : 'excluded',
    'exclusion-remove': 'un-excluded',
  }[action]
}

/** The server prefixes its per-item messages; the count already says it failed. */
const withoutFailedPrefix = (reason: string) =>
  reason.startsWith('Failed - ') ? reason.slice('Failed - '.length) : reason

/**
 * `verb` is the past participle of what was attempted, so every bulk action
 * reads the same and says what happens to the items that failed.
 */
export const reportBulkOutcome = (
  succeeded: number,
  failed: number,
  verb: string,
  failureReasons: string[] = [],
): void => {
  if (failed > 0) {
    const why = failureReasons.length
      ? ` (${failureReasons.map(withoutFailedPrefix).join('; ')})`
      : ''

    toast.error(
      `${formatItemCount(succeeded)} ${verb}. ${formatItemCount(failed)} could not be ${verb}${why}; the failed items stay selected.`,
    )
    return
  }

  toast.success(`${formatItemCount(succeeded)} ${verb}.`)
}
