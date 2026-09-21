import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintainerrLogger } from '../logging/logs.service';
import { OverlayItemStateEntity } from './entities/overlay-item-state.entities';

@Injectable()
export class OverlayStateService {
  constructor(
    @InjectRepository(OverlayItemStateEntity)
    private readonly repo: Repository<OverlayItemStateEntity>,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(OverlayStateService.name);
  }

  async getItemState(
    collectionId: number,
    mediaServerId: string,
    overlayMode = 'poster',
  ): Promise<OverlayItemStateEntity | null> {
    return this.repo.findOne({ where: { collectionId, mediaServerId, overlayMode } });
  }

  async markProcessed(
    collectionId: number,
    mediaServerId: string,
    originalPosterPath: string | null,
    daysLeftShown: number | null,
    overlayMode = 'poster',
  ): Promise<OverlayItemStateEntity> {
    let entity = await this.getItemState(collectionId, mediaServerId, overlayMode);

    if (entity) {
      entity.originalPosterPath =
        originalPosterPath ?? entity.originalPosterPath;
      entity.daysLeftShown = daysLeftShown;
      entity.processedAt = new Date();
    } else {
      entity = this.repo.create({
        collectionId,
        mediaServerId,
        overlayMode,
        originalPosterPath,
        daysLeftShown,
        processedAt: new Date(),
      });
    }

    return this.repo.save(entity);
  }

  async removeState(
    collectionId: number,
    mediaServerId: string,
    overlayMode?: string,
  ): Promise<void> {
    await this.repo.delete({ collectionId, mediaServerId, ...(overlayMode ? { overlayMode } : {}) });
  }

  async getCollectionStates(
    collectionId: number,
  ): Promise<OverlayItemStateEntity[]> {
    return this.repo.find({ where: { collectionId } });
  }

  async getAllStates(): Promise<OverlayItemStateEntity[]> {
    return this.repo.find();
  }

  async clearAllStates(): Promise<void> {
    await this.repo.clear();
    this.logger.log('Cleared all overlay item states');
  }

  async removeStatesForCollection(collectionId: number): Promise<void> {
    await this.repo.delete({ collectionId });
  }
}
