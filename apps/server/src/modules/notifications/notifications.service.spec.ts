import { createMockLogger } from '../../../test/utils/data';
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
