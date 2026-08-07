import { ApiProperty } from '@nestjs/swagger';
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
  /**
   * Optional ARR disk target path for diskspace rules.
   * Undefined means aggregate all reported paths.
   */
  arrDiskPath?: string;
  /**
   * Media-server user the PER_USER_PROPERTIES read; unused by every other one.
   * Held as a username because the companions key history on their own user
   * ids and agree only on this - Tautulli reports the plex.tv account id where
   * the media server reports its local one.
   */
  username?: string;
  section: number;
}
