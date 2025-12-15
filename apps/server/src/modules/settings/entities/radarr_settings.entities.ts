import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Collection } from '../../collections/entities/collection.entities';

@Entity()
export class RadarrSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  serverName: string;

  @Column({ nullable: true })
  url: string;

  @Column({ nullable: true })
  apiKey: string;

  @OneToMany(() => Collection, (collection) => collection.radarrSettings)
  collections: Collection[];
}
