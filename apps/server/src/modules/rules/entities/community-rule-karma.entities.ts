import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class CommunityRuleKarma {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  community_rule_id: number;
}
