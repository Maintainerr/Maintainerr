import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { LogLevel, LogSettingDto } from '@maintainerr/contracts';

export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_LOG_MAX_SIZE = 20;
export const DEFAULT_LOG_MAX_FILES = 7;

@Entity()
export class LogSettings implements LogSettingDto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false, default: DEFAULT_LOG_LEVEL })
  level: LogLevel;

  @Column({ nullable: false, default: DEFAULT_LOG_MAX_SIZE })
  max_size: number;

  @Column({ nullable: false, default: DEFAULT_LOG_MAX_FILES })
  max_files: number;
}
