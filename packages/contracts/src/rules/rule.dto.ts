import { createZodDto } from 'nestjs-zod/dto'
import { ruleDefinitionSchema, ruleSchema } from './rule'

export class RuleDto extends createZodDto(ruleSchema) {}
export class RuleDefinitionDto extends createZodDto(ruleDefinitionSchema) {}
