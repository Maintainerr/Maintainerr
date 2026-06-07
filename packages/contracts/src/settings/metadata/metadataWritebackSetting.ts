import z from 'zod'

export const metadataWritebackSettingSchema = z.object({
  enabled: z.boolean(),
})

export type MetadataWritebackSetting = z.infer<
  typeof metadataWritebackSettingSchema
>
