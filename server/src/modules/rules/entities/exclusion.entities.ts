import { PlexMetadata } from '@maintainerr/contracts';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Exclusion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  plexId: number;

  @Column({ nullable: true })
  ruleGroupId: number;

  @Column({ nullable: true })
  parent: number;

  @Column({ nullable: true }) // nullable because old exclusions don't have the type. They'll be added by a maintenance task
  type: 1 | 2 | 3 | 4 | undefined;

  plexData: PlexMetadata; // this will be added programatically
}
