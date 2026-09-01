import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Collection } from './collection.entities';

/**
 * Records that Maintainerr changed an item's membership of an automatic
 * collection and cannot prove the media server agreed. The row is the persistent
 * source of truth for "this one is ours" in the cases where no collection_media
 * row carries that fact.
 *
 * Two directions, same consequence:
 *  - 'remove': a rule removed the item, so the collection_media row is gone. A
 *    media server may not honor the removal immediately (eventual consistency)
 *    or at all (a silent no-op), so the item can linger in the server
 *    collection.
 *  - 'add': a rule asked for the item and the write was never answered, so no
 *    collection_media row was written. The server may well have applied it -
 *    Plex commits a collection write it has begun processing and can simply
 *    answer late - leaving a child nothing local accounts for.
 *
 * Either way the executor must recognise the child as an orphan to reconcile
 * rather than re-adopt as a spurious manual member. Cleared whenever the item is
 * added back to the collection (rule or manual) or confirmed gone from the
 * media server.
 *
 * Carries the same plain `collectionId` column plus `ON DELETE CASCADE` relation
 * as CollectionMedia, so markers are dropped with their collection on every
 * delete path (DB-enforced, foreign_keys is ON).
 */
export type CollectionMediaPendingDirection = 'add' | 'remove';

@Entity()
@Index('idx_collection_media_rule_removal', ['collectionId', 'mediaServerId'], {
  unique: true,
})
export class CollectionMediaRuleRemoval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  collectionId: number;

  @Column()
  mediaServerId: string;

  /**
   * Which unconfirmed change this records. Defaults to 'remove' so every row
   * written before the add direction existed keeps its meaning.
   */
  @Column({ type: 'varchar', default: 'remove' })
  direction: CollectionMediaPendingDirection;

  @ManyToOne(() => Collection, {
    onDelete: 'CASCADE',
  })
  collection: Relation<Collection>;
}
