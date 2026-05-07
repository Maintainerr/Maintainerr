import type { OverlayProcessorRunResult } from '@maintainerr/contracts'

export const formatOverlayProcessSummary = ({
  processed,
  reverted,
  skipped,
  errors,
}: OverlayProcessorRunResult) =>
  `Processed: ${processed}, Reverted: ${reverted}, Skipped: ${skipped}, Errors: ${errors}`
