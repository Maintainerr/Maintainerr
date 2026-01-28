import { createZodDto } from 'nestjs-zod/dto'
import { plexSettingSchema } from './plexSetting'

export class PlexSettingDto extends createZodDto(plexSettingSchema) {}
