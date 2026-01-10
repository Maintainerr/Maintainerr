import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class TaskRunning {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  name: string;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  runningSince: Date;

  @Column({ nullable: false, default: false })
  running: boolean;
}
