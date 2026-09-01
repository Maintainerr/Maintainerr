import { plural } from '@lingui/core/macro'
import { toast } from 'react-toastify'
import type { MediaActionOutcome } from '../components/Common/MediaActionModal'

type BulkAction = MediaActionOutcome['action']

/** The server prefixes its per-item messages; the count already says it failed. */
const withoutFailedPrefix = (reason: string) =>
  reason.startsWith('Failed - ') ? reason.slice('Failed - '.length) : reason

/**
 * Every action gets its own sentence, so a new one must be given wording
 * rather than inheriting whichever branch happened to sit under `default`.
 * The `never` makes that a compile error; the throw can only be reached if
 * something bypasses the type.
 */
const unhandledAction = (action: never) =>
  `Unhandled bulk action: ${String(action)}`

/**
 * Each branch below spells out a whole sentence instead of interpolating a
 * verb. English reuses "added" for both "5 items added." and "could not be
 * added", but most languages inflect the two slots differently, so a shared
 * verb fragment cannot be translated correctly in both.
 *
 * No collection id means the action covered every collection, so say which.
 */
const successMessage = (
  action: BulkAction,
  everyCollection: boolean,
  count: number,
): string => {
  switch (action) {
    case 'collection-add':
      return plural(count, { one: '# item added.', other: '# items added.' })
    case 'collection-remove':
      return everyCollection
        ? plural(count, {
            one: '# item removed from every collection.',
            other: '# items removed from every collection.',
          })
        : plural(count, {
            one: '# item removed.',
            other: '# items removed.',
          })
    case 'exclusion-add':
      return everyCollection
        ? plural(count, {
            one: '# item excluded everywhere.',
            other: '# items excluded everywhere.',
          })
        : plural(count, {
            one: '# item excluded.',
            other: '# items excluded.',
          })
    case 'exclusion-remove':
      return plural(count, {
        one: '# item un-excluded.',
        other: '# items un-excluded.',
      })
    default:
      throw new Error(unhandledAction(action))
  }
}

const failureMessage = (
  action: BulkAction,
  everyCollection: boolean,
  count: number,
  why: string,
): string => {
  switch (action) {
    case 'collection-add':
      return plural(count, {
        one: `# item could not be added${why}; the failed items stay selected.`,
        other: `# items could not be added${why}; the failed items stay selected.`,
      })
    case 'collection-remove':
      return everyCollection
        ? plural(count, {
            one: `# item could not be removed from every collection${why}; the failed items stay selected.`,
            other: `# items could not be removed from every collection${why}; the failed items stay selected.`,
          })
        : plural(count, {
            one: `# item could not be removed${why}; the failed items stay selected.`,
            other: `# items could not be removed${why}; the failed items stay selected.`,
          })
    case 'exclusion-add':
      return everyCollection
        ? plural(count, {
            one: `# item could not be excluded everywhere${why}; the failed items stay selected.`,
            other: `# items could not be excluded everywhere${why}; the failed items stay selected.`,
          })
        : plural(count, {
            one: `# item could not be excluded${why}; the failed items stay selected.`,
            other: `# items could not be excluded${why}; the failed items stay selected.`,
          })
    case 'exclusion-remove':
      return plural(count, {
        one: `# item could not be un-excluded${why}; the failed items stay selected.`,
        other: `# items could not be un-excluded${why}; the failed items stay selected.`,
      })
    default:
      throw new Error(unhandledAction(action))
  }
}

/** Takes the modal's outcome as-is, so no caller restates its counts. */
export const reportBulkOutcome = ({
  action,
  collectionId,
  succeededIds,
  failedIds,
  failureReasons = [],
}: MediaActionOutcome): void => {
  const everyCollection = collectionId === undefined
  const success = successMessage(action, everyCollection, succeededIds.length)

  if (failedIds.length > 0) {
    const why = failureReasons.length
      ? ` (${failureReasons.map(withoutFailedPrefix).join('; ')})`
      : ''

    toast.error(
      `${success} ${failureMessage(action, everyCollection, failedIds.length, why)}`,
    )
    return
  }

  toast.success(success)
}
