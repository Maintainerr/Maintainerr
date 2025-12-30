import { MediaItemWithParent } from '@maintainerr/contracts';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Exclusion {
  @PrimaryGeneratedColumn()
  id: number;

  /** Media server item ID (Plex ratingKey or Jellyfin GUID) */
  @Column()
  mediaServerId: string;

  @Column({ nullable: true })
  ruleGroupId: number;

  @Column({ nullable: true })
  parent: number;

  @Column({ nullable: true }) // nullable because old exclusions don't have the type. They'll be added by a maintenance task
  type: 1 | 2 | 3 | 4 | undefined;

  /** Server-agnostic media metadata (added programmatically, not stored in DB) */
  mediaData: MediaItemWithParent;

  /**
   * @deprecated Use mediaData instead
   */
  plexData: MediaItemWithParent;
}
