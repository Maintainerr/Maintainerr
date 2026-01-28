import { IAlterableMediaDto } from '../../collections/interfaces/collection-media.interface';

export class ExclusionDto {
  mediaServerId: string;
  ruleGroupId?: number;
  collectionId?: number;
  action?: ExclusionAction;
}

export interface ExclusionContextDto {
  mediaId: number;
  context: IAlterableMediaDto;
  collectionId: number;
  ruleGroupId: number;
  action: 0 | 1;
}
export enum ExclusionAction {
  ADD,
  REMOVE,
}
