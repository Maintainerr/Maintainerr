import { t } from '@lingui/core/macro'
import type { OverlayProcessorRunResult } from '@maintainerr/contracts'

export const formatOverlayProcessSummary = ({
  processed,
  reverted,
  skipped,
  errors,
}: OverlayProcessorRunResult) =>
  t`Processed: ${{ processed }}, Reverted: ${{ reverted }}, Skipped: ${{ skipped }}, Errors: ${{ errors }}`
