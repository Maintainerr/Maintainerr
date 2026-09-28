import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Collection } from '../../collections/entities/collection.entities';

@Entity()
export class SonarrSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  serverName: string;

  @Column({ nullable: true })
  url: string;

  @Column({ nullable: true })
  apiKey: string;

  // A protective tag this server's item gets while it is excluded. Removal on
  // un-exclude is opt-in, so a manually set tag is never stripped.
  @Column({ type: 'boolean', nullable: false, default: false })
  tagExclusions: boolean;

  @Column({ nullable: false, default: 'dnd' })
  exclusionTag: string;

  @Column({ type: 'boolean', nullable: false, default: false })
  untagOnUnexclude: boolean;

  @OneToMany(() => Collection, (collection) => collection.sonarrSettings)
  collections: Collection[];
}
