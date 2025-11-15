import { createZodDto } from 'nestjs-zod/dto'
import { overseerrSettingSchema } from './overseerrSetting'

export class OverseerrSettingDto extends createZodDto(overseerrSettingSchema) {}
