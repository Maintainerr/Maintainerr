import { LogLevel, LogSetting } from '@maintainerr/contracts';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_LOG_MAX_SIZE = 20;
export const DEFAULT_LOG_MAX_FILES = 7;

@Entity()
export class LogSettings implements LogSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false, default: DEFAULT_LOG_LEVEL })
  level: LogLevel;

  @Column({ nullable: false, default: DEFAULT_LOG_MAX_SIZE })
  max_size: number;

  @Column({ nullable: false, default: DEFAULT_LOG_MAX_FILES })
  max_files: number;
}
