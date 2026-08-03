import { AlterableMediaContext } from '../../collections/interfaces/collection-media.interface';

export class ExclusionDto {
  mediaServerId: string;
  ruleGroupId?: number;
  collectionId?: number;
  action?: ExclusionAction;
}

// Every field but mediaId is optional at runtime: the UI omits context on
// collection-page removals and collectionId on global exclusions, and the
// controller defaults a missing action to ADD.
export interface ExclusionContextDto {
  mediaId: string;
  context?: AlterableMediaContext;
  collectionId?: number;
  ruleGroupId?: number;
  action?: 0 | 1;
}
export enum ExclusionAction {
  ADD,
  REMOVE,
}
