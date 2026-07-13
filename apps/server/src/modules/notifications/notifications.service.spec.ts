import { MaintainerrEvent } from '@maintainerr/contracts';
import { ServiceUnavailableException } from '@nestjs/common';
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

  it('renders a movie by title even when the server reports a parent (Emby/Jellyfin library folder)', async () => {
    // Emby/Jellyfin set parentId to the containing library folder for movies;
    // keying the title off parentId presence used to render them as
    // "undefined - season undefined". Branching on type fixes that.
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({
        getMetadata: jest.fn().mockResolvedValue({
          title: 'A Sample Movie',
          type: 'movie',
          parentId: 'lib-movies',
        }),
      }),
    };
    const service = new NotificationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      {} as any,
      {} as any,
      mediaServerFactory as any,
      createMockLogger() as any,
      { createLogger: jest.fn().mockReturnValue(createMockLogger()) } as any,
    );

    const content = await (service as any).transformMessageContent(
      "🖼️ Overlays applied in '{collection_name}'.\n\n{media_items}",
      [{ mediaServerId: '1' }, { mediaServerId: '2' }],
      'All Collections',
    );

    expect(content).toContain('* A Sample Movie');
    expect(content).not.toContain('season undefined');
  });

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

  describe('media handled title snapshot (#3249)', () => {
    it('renders the pre-resolved title without a live lookup when the item is gone', async () => {
      // A delete action removes the item from the media server, so a live
      // lookup returns undefined. The snapshot captured before handling is what
      // keeps the title in the message instead of the generic fallback.
      const getMetadata = jest.fn().mockResolvedValue(undefined);
      const mediaServerFactory = {
        getService: jest.fn().mockResolvedValue({ getMetadata }),
      };
      const service = new NotificationService(
        { find: jest.fn().mockResolvedValue([]) } as any,
        { findOne: jest.fn().mockResolvedValue(null) } as any,
        {} as any,
        {} as any,
        mediaServerFactory as any,
        createMockLogger() as any,
        { createLogger: jest.fn().mockReturnValue(createMockLogger()) } as any,
      );

      const content = await (service as any).transformMessageContent(
        "✅ '{media_title}' has been handled by '{collection_name}'.",
        [
          {
            mediaServerId: '1',
            metadata: { title: 'A Sample Movie', type: 'movie' },
          },
        ],
        'My Collection',
      );

      expect(content).toBe(
        "✅ 'A Sample Movie' has been handled by 'My Collection'.",
      );
      // The snapshot is used directly; the (post-delete, failing) title lookup
      // is never attempted.
      expect(getMetadata).not.toHaveBeenCalled();
    });

    it('renders each pre-resolved title in a multi-item handled message', async () => {
      const getMetadata = jest.fn().mockResolvedValue(undefined);
      const mediaServerFactory = {
        getService: jest.fn().mockResolvedValue({ getMetadata }),
      };
      const service = new NotificationService(
        { find: jest.fn().mockResolvedValue([]) } as any,
        { findOne: jest.fn().mockResolvedValue(null) } as any,
        {} as any,
        {} as any,
        mediaServerFactory as any,
        createMockLogger() as any,
        { createLogger: jest.fn().mockReturnValue(createMockLogger()) } as any,
      );

      const content = await (service as any).transformMessageContent(
        "✅ These media items have been handled by '{collection_name}'.\n\n{media_items}",
        [
          {
            mediaServerId: '1',
            metadata: { title: 'A Sample Movie', type: 'movie' },
          },
          {
            mediaServerId: '2',
            metadata: {
              type: 'episode',
              grandparentTitle: 'Sample Series',
              parentIndex: 2,
              index: 5,
            },
          },
        ],
        'My Collection',
      );

      expect(content).toContain('* A Sample Movie');
      expect(content).toContain('* Sample Series - season 2 - episode 5');
      expect(getMetadata).not.toHaveBeenCalled();
    });

    it('falls back to a live lookup for items without a snapshot', async () => {
      const { service, mediaServerFactory } = createService();

      const content = await (service as any).transformMessageContent(
        "✅ '{media_title}' has been handled by '{collection_name}'.",
        [{ mediaServerId: '1' }],
        'My Collection',
      );

      expect(content).toBe(
        "✅ 'Test Media' has been handled by 'My Collection'.",
      );
      expect(mediaServerFactory.getService).toHaveBeenCalled();
    });

    it('still reports a genuinely unknown item when neither snapshot nor lookup resolves', async () => {
      const mediaServerFactory = {
        getService: jest.fn().mockResolvedValue({
          getMetadata: jest.fn().mockResolvedValue(undefined),
        }),
      };
      const service = new NotificationService(
        { find: jest.fn().mockResolvedValue([]) } as any,
        { findOne: jest.fn().mockResolvedValue(null) } as any,
        {} as any,
        {} as any,
        mediaServerFactory as any,
        createMockLogger() as any,
        { createLogger: jest.fn().mockReturnValue(createMockLogger()) } as any,
      );

      const content = await (service as any).transformMessageContent(
        "✅ '{media_title}' has been handled by '{collection_name}'.",
        [{ mediaServerId: '1' }],
        'My Collection',
      );

      expect(content).toBe(
        "✅ '1 item that no longer exists in the media server' has been handled by 'My Collection'.",
      );
    });
  });

  describe('collection handling failed message', () => {
    it('names the collection that failed', async () => {
      const { service } = createService();

      const { message } = (service as any).getContent(
        NotificationType.COLLECTION_HANDLING_FAILED,
        false,
      );
      const content = await (service as any).transformMessageContent(
        message,
        undefined,
        'My Collection',
      );

      expect(content).toBe(
        "⚠️ Couldn't finish handling one or more items in 'My Collection'. Check the Maintainerr logs for details.",
      );
    });

    it('drops the collection clause when there is no collection context', async () => {
      const { service } = createService();

      const { message } = (service as any).getContent(
        NotificationType.COLLECTION_HANDLING_FAILED,
        false,
      );
      const content = await (service as any).transformMessageContent(message);

      expect(content).toBe(
        "⚠️ Couldn't finish handling one or more items. Check the Maintainerr logs for details.",
      );
      expect(content).not.toContain('{collection_name}');
    });

    it('still resolves the collection name when the media server is unavailable', async () => {
      // The media-server-unreachable failure path emits this notification while
      // the media server throws ServiceUnavailableException. Collection name is
      // a plain substitution, so it must not leak the raw placeholder.
      const { service, mediaServerFactory } = createService();
      mediaServerFactory.getService.mockRejectedValue(
        new ServiceUnavailableException(),
      );

      const { message } = (service as any).getContent(
        NotificationType.COLLECTION_HANDLING_FAILED,
        false,
      );
      const content = await (service as any).transformMessageContent(
        message,
        undefined,
        'My Collection',
      );

      expect(content).toBe(
        "⚠️ Couldn't finish handling one or more items in 'My Collection'. Check the Maintainerr logs for details.",
      );
      expect(content).not.toContain('{collection_name}');
    });
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
