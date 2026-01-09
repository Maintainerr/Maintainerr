import { MediaItemWithParent } from '@maintainerr/contracts';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from './collection.entities';

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
  tmdbId: number;

  @Column()
  addDate: Date;

  @Column({ nullable: true })
  image_path: string;

  @Column({ default: false, nullable: true })
  isManual: boolean;

  @ManyToOne(() => Collection, (collection) => collection.collectionMedia, {
    onDelete: 'CASCADE',
  })
  collection: Collection;
}

/**
 * Collection media with server-agnostic metadata.
 */
export class CollectionMediaWithMetadata extends CollectionMedia {
  mediaData: MediaItemWithParent;
}
