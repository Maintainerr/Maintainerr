import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';
import { PlexMetadata } from '../../api/plex-api/interfaces/media.interface';
import { Collection } from './collection.entities';

@Entity()
@Index('idx_collection_media_collection_id', ['collectionId'])
export class CollectionMedia {
  private static readonly bigintToNumberTransformer: ValueTransformer = {
    to: (value?: number | null) => value,
    from: (value: string | number | null) =>
      value === null || value === undefined ? null : Number(value),
  };

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  collectionId: number;

  @Column()
  plexId: number;

  @Column({ nullable: true })
  tmdbId: number;

  @Column()
  addDate: Date;

  @Column({ nullable: true })
  image_path: string;

  @Column({ nullable: true })
  title?: string;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: CollectionMedia.bigintToNumberTransformer,
  })
  size?: number;

  @Column({ default: false, nullable: true })
  isManual: boolean;

  @ManyToOne(() => Collection, (collection) => collection.collectionMedia, {
    onDelete: 'CASCADE',
  })
  collection: Collection;
}

export class CollectionMediaWithPlexData extends CollectionMedia {
  plexData: PlexMetadata;
}
