import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Collection } from '../../collections/entities/collection.entities';
import { ICollection } from '../../collections/interfaces/collection.interface';
import { Notification } from '../../notifications/entities/notification.entities';
import { Rules } from './rules.entities';

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

  @Column({ nullable: true, default: null })
  ruleHandlerCronSchedule: string | null;

  @OneToMany(() => Rules, (rules) => rules.ruleGroup, {
    onDelete: 'CASCADE',
  })
  rules: Rules[];

  @ManyToMany(() => Notification, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinTable({
    name: 'notification_rulegroup',
    joinColumn: {
      name: 'rulegroupId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'notificationId',
      referencedColumnName: 'id',
    },
  })
  notifications: Notification[];

  @OneToOne(() => Collection, (c) => c.ruleGroup, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  collection: ICollection;
}
