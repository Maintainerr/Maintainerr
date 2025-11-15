import { Collection } from '../../collections/entities/collection.entities';
import { ICollection } from '../../collections/interfaces/collection.interface';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Rules } from './rules.entities';
import { Notification } from '../../notifications/entities/notification.entities';

@Entity('rule_group')
export class RuleGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  libraryId: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  collectionId: number;

  @Column({ nullable: false, default: true })
  useRules: boolean;

  @Column({ nullable: true })
  dataType: number;

  @OneToMany(() => Rules, (rules) => rules.ruleGroup, {
    onDelete: 'CASCADE',
  })
  rules: Rules[];

  @ManyToMany(() => Notification, {
    eager: true,
    onDelete: 'NO ACTION',
  })
  @JoinTable({
    name: 'notification_rulegroup',
    joinColumn: { name: 'rulegroupId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'notificationId', referencedColumnName: 'id' },
  })
  notifications: Notification[];

  @OneToOne(() => Collection, (c) => c.ruleGroup, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  collection: ICollection;
}
