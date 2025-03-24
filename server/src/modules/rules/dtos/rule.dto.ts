import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RuleOperators, RulePossibility } from '../constants/rules.constants';

export class RuleDto {
  operator: RuleOperators | null;
  action: RulePossibility;
  @ApiProperty({ type: 'array', required: true, items: { type: 'number' } })
  firstVal: [number, number];
  @ApiProperty({
    type: 'array',
    required: false,
    items: { type: 'number' },
  })
  lastVal?: [number, number];
  customVal?: { ruleTypeId: number; value: string };
  section: number;
}
