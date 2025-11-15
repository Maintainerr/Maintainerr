import { createZodDto } from 'nestjs-zod/dto'
import { logSettingSchema } from './logSetting'

export class LogSettingDto extends createZodDto(logSettingSchema) {}
