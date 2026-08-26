import z from 'zod'

export const sportarrMetadataSettingSchema = z.object({
  use_sportarr_net: z.boolean(),
})

export type SportarrMetadataSetting = z.infer<
  typeof sportarrMetadataSettingSchema
>
