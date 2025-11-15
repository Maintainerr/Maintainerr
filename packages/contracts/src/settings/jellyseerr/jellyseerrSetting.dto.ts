import { createZodDto } from 'nestjs-zod/dto'
import { jellyseerrSettingSchema } from './jellyseerrSetting'

export class JellyseerrSettingDto extends createZodDto(
  jellyseerrSettingSchema,
) {}
