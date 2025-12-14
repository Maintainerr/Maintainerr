import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { RuleGroup } from './rule-group.entities';

@Entity()
export class Rules {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ruleJson: string;

  @Column()
  ruleGroupId: number;

  @Column({ default: 0 })
  section: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => RuleGroup, (ruleGroup) => ruleGroup.rules, {
    onDelete: 'CASCADE',
  })
  ruleGroup: RuleGroup;
}
