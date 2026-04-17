import { OverlayTemplateMode } from '@maintainerr/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('overlay_templates')
export class OverlayTemplateEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  description: string;

  @Column({ type: 'varchar', length: 20 })
  mode: OverlayTemplateMode;

  @Column({ type: 'int' })
  canvasWidth: number;

  @Column({ type: 'int' })
  canvasHeight: number;

  @Column({ type: 'simple-json' })
  elements: unknown; // validated by Zod in service/controller

  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: false })
  isPreset: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
