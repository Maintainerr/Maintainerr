import { CollectionLogMeta, ECollectionLogType } from '@maintainerr/contracts';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from '../../collections/entities/collection.entities';

@Entity()
@Index('idx_collection_log_collection_id', ['collection'])
export class CollectionLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Collection, (collection) => collection.collectionLog, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  collection: Collection;

  @Column({
    type: 'datetime',
    nullable: false,
  })
  timestamp: Date;

  @Column()
  message: string;

  @Column({ nullable: false })
  type: ECollectionLogType;

  @Column('simple-json', { nullable: true })
  meta: CollectionLogMeta;
}
