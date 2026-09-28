import z from 'zod'

export const tracearrMediaSchema = z.object({
  id: z.uuid(),
})

// The plays of one item, read on demand for the media modal. Kept apart from
// the swept history row so the snapshot does not retain fields only this needs.
export const tracearrItemHistoryPageSchema = z.object({
  data: z.array(
    z.object({
      // Null on a play of media Tracearr could not identify.
      media_id: z.uuid().nullable(),
      grandparent_rating_key: z.string().nullable(),
      season_number: z.number().int().nullable(),
      duration_ms: z.number().nullable(),
      started_at: z.iso.datetime(),
      stopped_at: z.iso.datetime().nullable(),
      user: z.object({
        id: z.uuid(),
        username: z.string().nullable(),
      }),
    }),
  ),
  meta: z.object({
    nextCursor: z.string().nullable(),
  }),
})

export type TracearrItemHistoryRow = z.infer<
  typeof tracearrItemHistoryPageSchema
>['data'][number]
