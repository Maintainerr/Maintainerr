import {
  FrameConfig,
  OverlayStyleConfig,
  OverlayTextConfig,
} from '@maintainerr/contracts';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('overlay_settings')
export class OverlaySettingsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'simple-json' })
  posterOverlayText: OverlayTextConfig;

  @Column({ type: 'simple-json' })
  posterOverlayStyle: OverlayStyleConfig;

  @Column({ type: 'simple-json' })
  posterFrame: FrameConfig;

  @Column({ type: 'simple-json' })
  titleCardOverlayText: OverlayTextConfig;

  @Column({ type: 'simple-json' })
  titleCardOverlayStyle: OverlayStyleConfig;

  @Column({ type: 'simple-json' })
  titleCardFrame: FrameConfig;

  @Column({ type: 'varchar', nullable: true })
  cronSchedule: string | null;

  @Column({ default: true })
  applyOnAdd: boolean;
}
