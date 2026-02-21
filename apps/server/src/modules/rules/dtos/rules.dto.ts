import { MediaItemType } from '@maintainerr/contracts';
import { ICollection } from '../../collections/interfaces/collection.interface';
import { Notification } from '../../notifications/entities/notification.entities';
import { RuleDto } from './rule.dto';
import { RuleDbDto } from './ruleDb.dto';

export class RulesDto {
  id?: number;
  libraryId: string;
  name: string;
  description: string;
  isActive?: boolean;
  arrAction?: number;
  useRules?: boolean;
  ruleHandlerCronSchedule?: string | null;
  collection?: ICollection;
  listExclusions?: boolean;
  forceSeerr?: boolean;
  rules: RuleDto[] | RuleDbDto[];
  manualCollection?: boolean;
  manualCollectionName?: string;
  dataType: MediaItemType;
  tautulliWatchedPercentOverride?: number;
  notifications?: Notification[];
  radarrSettingsId?: number;
  sonarrSettingsId?: number;
}
