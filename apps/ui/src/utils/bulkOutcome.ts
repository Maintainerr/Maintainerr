import { toast } from 'react-toastify'
import type { MediaAction } from '../components/MediaActionModal'

export const formatItemCount = (count: number): string =>
  `${count} item${count === 1 ? '' : 's'}`

export const bulkOutcomeVerb = (action: MediaAction): string =>
  ({
    'collection-add': 'added',
    'collection-remove': 'removed',
    'collection-remove-all': 'removed from every collection',
    'exclusion-add': 'excluded',
    'exclusion-remove': 'un-excluded',
  })[action]

/**
 * `verb` is the past participle of what was attempted, so every bulk action
 * reads the same and says what happens to the items that failed.
 */
export const reportBulkOutcome = (
  succeeded: number,
  failed: number,
  verb: string,
): void => {
  if (failed > 0) {
    toast.error(
      `${formatItemCount(succeeded)} ${verb}. ${formatItemCount(failed)} could not be ${verb}; the failed items stay selected.`,
    )
    return
  }

  toast.success(`${formatItemCount(succeeded)} ${verb}.`)
}
