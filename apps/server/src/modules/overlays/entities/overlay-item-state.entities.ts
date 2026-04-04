import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from '../../collections/entities/collection.entities';

@Entity('overlay_item_state')
@Index('IDX_overlay_item_state_collection_media', ['collectionId', 'mediaServerId'], {
  unique: true,
})
export class OverlayItemStateEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  collectionId: number;

  @Column({ type: 'varchar' })
  mediaServerId: string;

  @Column({ type: 'varchar', nullable: true })
  originalPosterPath: string | null;

  @Column({ type: 'integer', nullable: true })
  daysLeftShown: number | null;

  @CreateDateColumn()
  processedAt: Date;

  @ManyToOne(() => Collection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectionId' })
  collection: Collection;
}
