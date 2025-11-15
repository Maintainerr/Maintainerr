import { createZodDto } from 'nestjs-zod/dto'
import { tautulliSettingSchema } from './tautulliSetting'

export class TautulliSettingDto extends createZodDto(tautulliSettingSchema) {}
