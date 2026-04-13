import type { OverlayTemplate } from '@maintainerr/contracts';
import {
  createCollection,
  createCollectionMedia,
  createMockLogger,
} from '../../../test/utils/data';
import { OverlayProcessorService } from './overlay-processor.service';

describe('OverlayProcessorService', () => {
  it('processes collections with deleteAfterDays equal to zero', async () => {
    const settingsService = {
      getSettings: jest.fn().mockResolvedValue({ enabled: true }),
    };
    const stateService = {
      getItemState: jest.fn().mockResolvedValue(null),
    };
    const template: OverlayTemplate = {
      id: 1,
      name: 'Default poster',
      description: '',
      mode: 'poster',
      canvasWidth: 1000,
      canvasHeight: 1500,
      elements: [],
      isDefault: true,
      isPreset: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const templateService = {
      resolveForCollection: jest.fn().mockResolvedValue(template),
    };
    const logger = createMockLogger();

    const service = new OverlayProcessorService(
      {} as any,
      {} as any,
      settingsService as any,
      stateService as any,
      {} as any,
      templateService as any,
      { emit: jest.fn() } as any,
      logger,
    );

    const collection = createCollection({
      id: 1,
      title: 'Immediate action',
      type: 'movie',
      deleteAfterDays: 0,
      overlayTemplateId: null,
    });
    collection.collectionMedia = [
      createCollectionMedia(collection, {
        mediaServerId: 'media-1',
        addDate: new Date('2026-04-01T00:00:00.000Z'),
      }),
    ];

    jest.spyOn(service, 'applyTemplateOverlay').mockResolvedValue(true);

    const result = await service.processCollection(collection as any);

    expect(service.applyTemplateOverlay).toHaveBeenCalledWith(
      'media-1',
      collection.id,
      expect.any(Date),
      template,
    );
    expect(result.processed).toBe(1);
  });
});