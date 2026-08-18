import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { ECollectionLogType } from '@maintainerr/contracts'

// The log type reached the screen as its enum name. Shared descriptors give
// the filter and the row badge one translated label instead.
export const collectionLogTypeLabels: Record<
  ECollectionLogType,
  MessageDescriptor
> = {
  [ECollectionLogType.COLLECTION]: msg`Collection`,
  [ECollectionLogType.MEDIA]: msg`Media`,
  [ECollectionLogType.RULES]: msg`Rules`,
}
