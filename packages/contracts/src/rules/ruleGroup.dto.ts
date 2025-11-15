import { createZodDto } from 'nestjs-zod/dto'
import { ruleGroupSchema, ruleGroupUpdateSchema } from './ruleGroup'

export class RuleGroupDto extends createZodDto(ruleGroupSchema) {}

export class RuleGroupUpdateDto extends createZodDto(ruleGroupUpdateSchema) {}
