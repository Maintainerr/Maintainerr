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
