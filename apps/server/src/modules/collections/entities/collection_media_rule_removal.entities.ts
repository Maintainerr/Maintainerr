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
 * Records that a rule removed an item from an automatic collection. The row is
 * the persistent source of truth for "this is ours and was removed" - unlike the
 * collection_media row, which is deleted on removal. A media server may not honor
 * the removal immediately (eventual consistency) or at all (a silent no-op), so
 * the item can linger in the server collection; this marker lets the executor
 * recognise it as an orphan to remove rather than re-adopt as a spurious manual
 * member. Cleared whenever the item is added back to the collection (rule or
 * manual) or confirmed gone from the media server.
 *
 * Carries the same plain `collectionId` column plus `ON DELETE CASCADE` relation
 * as CollectionMedia, so markers are dropped with their collection on every
 * delete path (DB-enforced, foreign_keys is ON).
 */
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

  @ManyToOne(() => Collection, {
    onDelete: 'CASCADE',
  })
  collection: Relation<Collection>;
}
