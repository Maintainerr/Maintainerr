import { RuleDto } from './rule.dto';

export class CommunityRule {
  id?: number;
  karma?: number;
  appVersion?: string;
  name: string;
  description: string;
  JsonRules: RuleDto;
}
