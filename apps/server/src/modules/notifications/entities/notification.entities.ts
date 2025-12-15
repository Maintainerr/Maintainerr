import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RuleGroup } from '../../rules/entities/rule-group.entities';
import { NotificationAgentOptions } from '../notifications-interfaces';

@Entity()
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  name: string;

  @Column({ nullable: false })
  agent: string;

  @Column({ default: false })
  enabled: boolean;

  @Column('simple-json', { nullable: true })
  types: number[];

  @Column('json', { nullable: false })
  options: NotificationAgentOptions;

  @Column({ default: 3, nullable: false })
  aboutScale: number;

  @ManyToMany(() => RuleGroup, (rulegroup) => rulegroup.notifications, {
    onDelete: 'CASCADE',
  })
  rulegroups: RuleGroup[];
}
