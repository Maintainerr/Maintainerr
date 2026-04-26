import { MaintainerrEvent } from '@maintainerr/contracts';
import { createMockLogger } from '../../../test/utils/data';
import {
  CollectionMediaAddedDto,
  CollectionMediaRemovedDto,
} from '../events/events.dto';
import { NotificationType } from './notifications-interfaces';
import { NotificationService } from './notifications.service';

describe('NotificationService', () => {
  const createService = () => {
    const notificationRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const ruleGroupRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({
        getMetadata: jest.fn().mockResolvedValue({ title: 'Test Media' }),
      }),
    };

    const service = new NotificationService(
      notificationRepo as any,
      ruleGroupRepo as any,
      {} as any,
      {} as any,
      mediaServerFactory as any,
      createMockLogger() as any,
      { createLogger: jest.fn().mockReturnValue(createMockLogger()) } as any,
    );

    return { service, mediaServerFactory };
  };

  it('builds a single overlay applied notification message', async () => {
    const { service } = createService();

    const result = await service.handleNotification(
      NotificationType.OVERLAY_APPLIED,
      [{ mediaServerId: '1' }],
      'My Collection',
    );

    expect(result).toBe('Success');

    const content = await (service as any).transformMessageContent(
      "🖼️ Overlay has been applied to '{media_title}' in '{collection_name}'.",
      [{ mediaServerId: '1' }],
      'My Collection',
    );

    expect(content).toBe(
      "🖼️ Overlay has been applied to 'Test Media' in 'My Collection'.",
    );
  });

  describe('rule batch dedupe', () => {
    const setBatch = (service: NotificationService, active: boolean) => {
      (service as any).ruleQueueStatusChanged({
        type: MaintainerrEvent.RuleHandlerQueue_StatusUpdated,
        data: { processingQueue: active },
      });
    };

    const addedDto = (
      collectionName: string,
      ids: string[],
    ): CollectionMediaAddedDto =>
      new CollectionMediaAddedDto(
        ids.map((mediaServerId) => ({ mediaServerId })),
        collectionName,
        { type: 'collection', value: 1 },
        1,
        7,
      );

    const removedDto = (
      collectionName: string,
      ids: string[],
    ): CollectionMediaRemovedDto =>
      new CollectionMediaRemovedDto(
        ids.map((mediaServerId) => ({ mediaServerId })),
        collectionName,
        { type: 'collection', value: 1 },
        1,
        7,
      );

    it('collapses sibling-rule notifications for the same item within a batch', async () => {
      const { service } = createService();
      const handle = jest
        .spyOn(service, 'handleNotification')
        .mockResolvedValue('Success' as any);

      setBatch(service, true);
      await (service as any).collectionMediaAdded(addedDto('Shared', ['m1']));
      await (service as any).collectionMediaAdded(addedDto('Shared', ['m1']));

      expect(handle).toHaveBeenCalledTimes(1);
      expect(handle).toHaveBeenCalledWith(
        NotificationType.MEDIA_ADDED_TO_COLLECTION,
        [{ mediaServerId: 'm1' }],
        'Shared',
        7,
        undefined,
        { type: 'collection', value: 1 },
      );
    });

    it('forwards only the items not already seen in the batch', async () => {
      const { service } = createService();
      const handle = jest
        .spyOn(service, 'handleNotification')
        .mockResolvedValue('Success' as any);

      setBatch(service, true);
      await (service as any).collectionMediaAdded(
        addedDto('Shared', ['m1', 'm2']),
      );
      await (service as any).collectionMediaAdded(
        addedDto('Shared', ['m1', 'm3']),
      );

      expect(handle).toHaveBeenCalledTimes(2);
      expect(handle.mock.calls[1][1]).toEqual([{ mediaServerId: 'm3' }]);
    });

    it('treats added and removed as independent dedupe keys', async () => {
      const { service } = createService();
      const handle = jest
        .spyOn(service, 'handleNotification')
        .mockResolvedValue('Success' as any);

      setBatch(service, true);
      await (service as any).collectionMediaAdded(addedDto('Shared', ['m1']));
      await (service as any).collectionMediaRemoved(
        removedDto('Shared', ['m1']),
      );

      expect(handle).toHaveBeenCalledTimes(2);
    });

    it('does not dedupe across batches', async () => {
      const { service } = createService();
      const handle = jest
        .spyOn(service, 'handleNotification')
        .mockResolvedValue('Success' as any);

      setBatch(service, true);
      await (service as any).collectionMediaAdded(addedDto('Shared', ['m1']));
      setBatch(service, false);
      setBatch(service, true);
      await (service as any).collectionMediaAdded(addedDto('Shared', ['m1']));

      expect(handle).toHaveBeenCalledTimes(2);
    });

    it('does not dedupe when no batch is active', async () => {
      const { service } = createService();
      const handle = jest
        .spyOn(service, 'handleNotification')
        .mockResolvedValue('Success' as any);

      await (service as any).collectionMediaAdded(addedDto('Shared', ['m1']));
      await (service as any).collectionMediaAdded(addedDto('Shared', ['m1']));

      expect(handle).toHaveBeenCalledTimes(2);
    });

    it('records seen items synchronously to avoid handler-interleaving races', async () => {
      const { service } = createService();
      let resolveFirst: () => void;
      const firstHandled = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      const handle = jest
        .spyOn(service, 'handleNotification')
        .mockImplementationOnce(async () => {
          await firstHandled;
          return 'Success' as any;
        })
        .mockResolvedValue('Success' as any);

      setBatch(service, true);
      const first = (service as any).collectionMediaAdded(
        addedDto('Shared', ['m1']),
      );
      const second = (service as any).collectionMediaAdded(
        addedDto('Shared', ['m1']),
      );
      resolveFirst!();
      await Promise.all([first, second]);

      expect(handle).toHaveBeenCalledTimes(1);
    });
  });

  it('defines content for overlay reverted notifications', () => {
    const { service } = createService();

    expect(
      (service as any).getContent(NotificationType.OVERLAY_REVERTED, false),
    ).toEqual({
      subject: 'Overlay Reverted',
      message:
        "↩️ Overlay has been reverted for '{media_title}' in '{collection_name}'.",
    });

    expect(
      (service as any).getContent(NotificationType.OVERLAY_REVERTED, true),
    ).toEqual({
      subject: 'Overlay Reverted',
      message:
        "↩️ Overlays have been reverted for these media items in '{collection_name}'.\n\n{media_items}",
    });
  });
});
