import { MediaItemWithParent } from '@maintainerr/contracts';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from './collection.entities';

export enum CollectionMediaManualMembershipSource {
  LEGACY = 'legacy',
  LOCAL = 'local',
  SHARED = 'shared',
}

@Entity()
@Index('idx_collection_media_collection_id', ['collectionId'])
export class CollectionMedia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  collectionId: number;

  @Column()
  mediaServerId: string;

  @Column({ nullable: true })
  tmdbId?: number;

  @Column({ nullable: true })
  tvdbId?: number;

  @Column()
  addDate: Date;

  @Column({ nullable: true })
  image_path?: string;

  @Column({ default: false, nullable: true })
  isManual: boolean;

  @Column({ nullable: true, default: null })
  includedByRule: boolean | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  manualMembershipSource: CollectionMediaManualMembershipSource | null;

  @Column({ type: 'bigint', nullable: true, default: null })
  sizeBytes: number | null;

  @BeforeInsert()
  @BeforeUpdate()
  syncLegacyManualFlag(): void {
    this.isManual = this.manualMembershipSource != null;
  }

  @ManyToOne(() => Collection, (collection) => collection.collectionMedia, {
    onDelete: 'CASCADE',
  })
  collection: Collection;
}

export const hasCollectionMediaRuleMembership = (
  collectionMedia: Pick<
    CollectionMedia,
    'isManual' | 'includedByRule' | 'manualMembershipSource'
  >,
): boolean => collectionMedia.includedByRule ?? !collectionMedia.isManual;

export const hasCollectionMediaManualMembership = (
  collectionMedia: Pick<CollectionMedia, 'isManual' | 'manualMembershipSource'>,
): boolean =>
  collectionMedia.manualMembershipSource != null || collectionMedia.isManual;

/**
 * Collection media with server-agnostic metadata.
 */
export class CollectionMediaWithMetadata extends CollectionMedia {
  mediaData: MediaItemWithParent;
}
