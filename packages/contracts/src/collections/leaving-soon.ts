import { z } from 'zod'
import { MediaItemType, MediaItemTypes } from '../media-server/enums'

/**
 * A single scheduled-deletion media item inside a leaving-soon collection.
 *
 * `mediaServerId` is the media-server item id (for Jellyfin/Emby this is the
 * item GUID), which the jellyfin-plugin-leaving-soon provider resolves back to
 * an on-disk path from Jellyfin itself. `deletionDate` is precomputed as
 * `addDate + deleteAfterDays`, matching the worker's due-date predicate.
 */
export const leavingSoonMediaItemSchema = z.object({
  mediaServerId: z.string(),
  addDate: z.date(),
  deletionDate: z.date().nullable(),
  tmdbId: z.number().nullable(),
})

/**
 * A collection that schedules deletion of its members, with the member media
 * currently in its grace period.
 */
export const leavingSoonCollectionSchema = z.object({
  id: z.number(),
  title: z.string(),
  type: z.enum(MediaItemTypes as [MediaItemType, ...MediaItemType[]]),
  libraryId: z.string(),
  mediaServerId: z.string().nullable(),
  deleteAfterDays: z.number().nullable(),
  arrAction: z.number(),
  media: z.array(leavingSoonMediaItemSchema),
})

/** Response envelope for `GET /api/collections/leaving-soon`. */
export const leavingSoonResponseSchema = z.object({
  collections: z.array(leavingSoonCollectionSchema),
  total: z.number(),
})

export type LeavingSoonMediaItem = z.infer<typeof leavingSoonMediaItemSchema>
export type LeavingSoonCollection = z.infer<typeof leavingSoonCollectionSchema>
export type LeavingSoonResponse = z.infer<typeof leavingSoonResponseSchema>
