import z from 'zod'

export const tracearrHistoryItemSchema = z.object({
  id: z.uuid(),
  server_id: z.uuid(),
  server_type: z.string().min(1),
  media_type: z.string().min(1),
  rating_key: z.string().min(1).nullable(),
  parent_rating_key: z.string().min(1).nullable(),
  grandparent_rating_key: z.string().min(1).nullable(),
  season_number: z.number().int().nullable(),
  episode_number: z.number().int().nullable(),
  percent_complete: z.number().nullable(),
  watched: z.boolean(),
  started_at: z.iso.datetime(),
  stopped_at: z.iso.datetime().nullable(),
  user: z.object({
    id: z.uuid(),
  }),
})

export type TracearrHistoryItem = z.infer<typeof tracearrHistoryItemSchema>

export const tracearrHistoryPageSchema = z.object({
  data: z.array(tracearrHistoryItemSchema),
  meta: z.object({
    nextCursor: z.string().nullable(),
    pageSize: z.number().int(),
  }),
})

export type TracearrHistoryPage = z.infer<typeof tracearrHistoryPageSchema>
