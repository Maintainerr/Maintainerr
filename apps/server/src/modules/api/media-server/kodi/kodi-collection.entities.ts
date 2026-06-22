import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Shadow index for Kodi collections that cannot be tag-backed.
 *
 * Kodi's `tag` field exists only on movies and TV shows — seasons and episodes
 * have no writable tag over JSON-RPC. Movie/show collections are therefore
 * tag-backed (visible inside Kodi); season/episode collection membership is
 * tracked here instead. The adapter routes by the collection id prefix
 * (`kc_tag:` vs `kc_shadow:`), so the shared collection layer stays
 * server-agnostic.
 */
@Entity('kodi_collection')
export class KodiCollection {
  // The opaque `kc_shadow:<uuid>` id Maintainerr stores as the mediaServerId.
  @PrimaryColumn()
  id: string;

  @Column()
  libraryId: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  summary?: string;

  @Column()
  addDate: Date;
}

@Entity('kodi_collection_member')
@Index('idx_kodi_collection_member_collection_id', ['collectionId'])
export class KodiCollectionMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  collectionId: string;

  // Composite Kodi item id (e.g. `episode-12`).
  @Column()
  itemId: string;
}
