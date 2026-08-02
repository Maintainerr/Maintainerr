import z from 'zod'

export const tracearrServerSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
})

export type TracearrServer = z.infer<typeof tracearrServerSchema>
