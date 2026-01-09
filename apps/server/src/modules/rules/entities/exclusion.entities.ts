import { MediaItemType, MediaItemWithParent } from '@maintainerr/contracts';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Exclusion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  mediaServerId: string;

  @Column({ nullable: true })
  ruleGroupId: number;

  @Column({ nullable: true })
  parent: number;

  @Column({ nullable: true }) // nullable because old exclusions don't have the type. They'll be added by a maintenance task
  type: MediaItemType | undefined;

  mediaData: MediaItemWithParent;
}
