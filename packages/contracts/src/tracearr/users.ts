import z from 'zod'

export const tracearrUsersPageSchema = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      accounts: z.array(
        z.object({
          server_id: z.uuid(),
          server_type: z.string().min(1),
          external_user_id: z.string().min(1),
          // Tracearr's own copy of the account name, which can differ from
          // the media server's for the same Plex account.
          username: z.string().min(1).nullish(),
        }),
      ),
    }),
  ),
  meta: z.object({
    nextCursor: z.string().nullable(),
    pageSize: z.number().int(),
  }),
})

export type TracearrUsersPage = z.infer<typeof tracearrUsersPageSchema>
