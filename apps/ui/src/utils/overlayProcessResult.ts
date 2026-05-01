import type { OverlayProcessResult } from '../api/overlays'

export const formatOverlayProcessSummary = ({
  processed,
  reverted,
  errors,
}: Pick<OverlayProcessResult, 'processed' | 'reverted' | 'errors'>) =>
  `Processed: ${processed}, Reverted: ${reverted}, Errors: ${errors}`
