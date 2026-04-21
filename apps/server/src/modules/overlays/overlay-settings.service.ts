import {
  DEFAULT_OVERLAY_SETTINGS,
  OverlayExport,
  overlayExportSchema,
  OverlaySettings,
  OverlaySettingsUpdate,
  overlaySettingsUpdateSchema,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintainerrLogger } from '../logging/logs.service';
import { OverlaySettingsEntity } from './entities/overlay-settings.entities';

@Injectable()
export class OverlaySettingsService {
  constructor(
    @InjectRepository(OverlaySettingsEntity)
    private readonly repo: Repository<OverlaySettingsEntity>,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(OverlaySettingsService.name);
  }

  async getSettings(): Promise<OverlaySettings> {
    let entity = await this.repo.findOne({ where: { id: 1 } });

    if (!entity) {
      entity = this.repo.create({
        id: 1,
        ...DEFAULT_OVERLAY_SETTINGS,
      });
      entity = await this.repo.save(entity);
      this.logger.log('Initialized default overlay settings');
    }

    return {
      enabled: entity.enabled,
      posterOverlayText: entity.posterOverlayText,
      posterOverlayStyle: entity.posterOverlayStyle,
      posterFrame: entity.posterFrame,
      titleCardOverlayText: entity.titleCardOverlayText,
      titleCardOverlayStyle: entity.titleCardOverlayStyle,
      titleCardFrame: entity.titleCardFrame,
      cronSchedule: entity.cronSchedule,
    };
  }

  async updateSettings(dto: OverlaySettingsUpdate): Promise<OverlaySettings> {
    const parsed = overlaySettingsUpdateSchema.parse(dto);

    // Ensure singleton row exists
    await this.getSettings();

    await this.repo.update(1, parsed);
    this.logger.log('Updated overlay settings');
    return this.getSettings();
  }

  exportSettings(
    type: 'poster' | 'titlecard',
    settings: OverlaySettings,
  ): OverlayExport {
    if (type === 'titlecard') {
      return {
        version: 1,
        overlayText: settings.titleCardOverlayText,
        overlayStyle: settings.titleCardOverlayStyle,
        frame: settings.titleCardFrame,
      };
    }
    return {
      version: 1,
      overlayText: settings.posterOverlayText,
      overlayStyle: settings.posterOverlayStyle,
      frame: settings.posterFrame,
    };
  }

  async importSettings(
    type: 'poster' | 'titlecard',
    data: unknown,
  ): Promise<OverlaySettings> {
    const parsed = overlayExportSchema.parse(data);

    const update: OverlaySettingsUpdate =
      type === 'titlecard'
        ? {
            titleCardOverlayText: parsed.overlayText,
            titleCardOverlayStyle: parsed.overlayStyle,
            titleCardFrame: parsed.frame,
          }
        : {
            posterOverlayText: parsed.overlayText,
            posterOverlayStyle: parsed.overlayStyle,
            posterFrame: parsed.frame,
          };

    return this.updateSettings(update);
  }
}
