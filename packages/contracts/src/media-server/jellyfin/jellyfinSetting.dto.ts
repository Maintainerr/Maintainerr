import { createZodDto } from 'nestjs-zod/dto'
import { jellyfinSettingSchema } from './jellyfinSetting'

export class JellyfinSettingDto extends createZodDto(jellyfinSettingSchema) {}
