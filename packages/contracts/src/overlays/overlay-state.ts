export interface OverlayItemState {
  id: number
  collectionId: number
  mediaServerId: string
  originalPosterPath: string | null
  daysLeftShown: number | null
  processedAt: Date
}
