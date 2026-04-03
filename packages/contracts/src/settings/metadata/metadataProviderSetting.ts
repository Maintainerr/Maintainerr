import z from 'zod'
import { MetadataProviderPreference } from './metadataProviderPreference'

export const metadataProviderSettingSchema = z.object({
  preference: z.enum(MetadataProviderPreference),
})

export type MetadataProviderSetting = z.infer<
  typeof metadataProviderSettingSchema
>
