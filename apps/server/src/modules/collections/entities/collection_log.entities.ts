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
    onDelete: 'CASCADE',
  })
  collection: Collection;

  @Column({
    type: 'datetime',
    nullable: false,
    default: () => 'CURRENT_TIMESTAMP',
  })
  timestamp: Date;

  @Column()
  message: string;

  @Column({ nullable: true })
  type: ECollectionLogType;

  @Column('simple-json', { nullable: true })
  meta: CollectionLogMeta;
}
