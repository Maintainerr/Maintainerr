import z from 'zod'

export const tracearrServerSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
})

export type TracearrServer = z.infer<typeof tracearrServerSchema>

// Rating keys only mean anything within one media server, so a candidate is
// confirmed by reading its own library items: the same key resolving to the
// same title on the media server Maintainerr manages means one id space.
// /recently-added is used because it lists library items rather than plays,
// so it works on a server nobody has watched anything on.
export const tracearrRecentlyAddedPageSchema = z.object({
  data: z.array(
    z.object({
      rating_key: z.string().min(1).nullable(),
      title: z.string().min(1),
      year: z.number().int().nullable(),
    }),
  ),
})

// The server list carries no type, so /libraries supplies it: it reports one
// row per library with its server, and needs no watch history to do so.
export const tracearrLibrariesPageSchema = z.object({
  data: z.array(
    z.object({
      server_id: z.uuid(),
      server_type: z.string().min(1),
    }),
  ),
})
