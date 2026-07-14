import { createMockLogger } from '../../../test/utils/data';
import { NotificationMediaItem } from '../events/events.dto';
import { NotificationTimerService } from './notifications-timer.service';
import { NotificationType } from './notifications-interfaces';

describe('NotificationTimerService', () => {
  const DELETE_AFTER_DAYS = 30;
  const ABOUT_SCALE = 3;

  // A due item is one added (deleteAfterDays - aboutScale) days ago.
  const dueAddDate = () =>
    new Date(
      Date.now() - (DELETE_AFTER_DAYS - ABOUT_SCALE) * 86400000,
    ).toISOString();

  const createService = ({
    media,
    metadata,
    requestedBy = [],
    agentCount = 1,
  }: {
    media: { mediaServerId: string; tmdbId?: number; addDate: string }[];
    metadata?: Record<string, unknown>;
    requestedBy?: string[];
    agentCount?: number;
  }) => {
    const agents = Array.from({ length: agentCount }, (_, i) => ({
      getNotification: () => ({ id: i + 1 }),
    }));

    const handleNotification = jest.fn().mockResolvedValue('Success');
    const notificationService = {
      getActiveAgents: () => agents,
      getNotificationConfigurations: jest.fn().mockResolvedValue(
        agents.map((_, i) => ({
          id: i + 1,
          enabled: true,
          aboutScale: ABOUT_SCALE,
          rulegroups: [
            {
              collection: { id: 10, deleteAfterDays: DELETE_AFTER_DAYS },
            },
          ],
        })),
      ),
      handleNotification,
    };

    const getMetadata = jest.fn().mockResolvedValue(metadata);
    const mediaServerFactory = {
      getService: jest.fn().mockResolvedValue({ getMetadata }),
    };

    const getRequestedByUsernames = jest.fn().mockResolvedValue(requestedBy);
    const seerrApi = { getRequestedByUsernames };

    const collectionService = {
      getCollectionMedia: jest.fn().mockResolvedValue(media),
    };

    const service = new NotificationTimerService(
      {} as never,
      createMockLogger() as never,
      collectionService as never,
      notificationService as never,
      mediaServerFactory as never,
      seerrApi as never,
    );

    return {
      service,
      handleNotification,
      getMetadata,
      getRequestedByUsernames,
    };
  };

  const notifiedItems = (
    handleNotification: jest.Mock,
  ): NotificationMediaItem[] => handleNotification.mock.calls[0][1];

  it('attaches the Seerr requesters to a due item', async () => {
    const { service, handleNotification, getRequestedByUsernames } =
      createService({
        media: [{ mediaServerId: '1', tmdbId: 500, addDate: dueAddDate() }],
        metadata: { title: 'Sample Movie', type: 'movie' },
        requestedBy: ['alice'],
      });

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(handleNotification).toHaveBeenCalledTimes(1);
    expect(handleNotification.mock.calls[0][0]).toBe(
      NotificationType.MEDIA_ABOUT_TO_BE_HANDLED,
    );
    expect(notifiedItems(handleNotification)[0]).toMatchObject({
      mediaServerId: '1',
      requestedBy: ['alice'],
    });
    // A movie has no season to narrow by.
    expect(getRequestedByUsernames).toHaveBeenCalledWith(500, undefined);
  });

  it('narrows the requester lookup to the season of a season item', async () => {
    // Otherwise a season collection credits whoever requested another season.
    const { service, getRequestedByUsernames } = createService({
      media: [{ mediaServerId: '1', tmdbId: 500, addDate: dueAddDate() }],
      metadata: { title: 'Sample Series', type: 'season', index: 2 },
    });

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(getRequestedByUsernames).toHaveBeenCalledWith(500, 2);
  });

  it('narrows to the parent season of an episode item', async () => {
    const { service, getRequestedByUsernames } = createService({
      media: [{ mediaServerId: '1', tmdbId: 500, addDate: dueAddDate() }],
      metadata: {
        title: 'Sample Series',
        type: 'episode',
        index: 4,
        parentIndex: 2,
      },
    });

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(getRequestedByUsernames).toHaveBeenCalledWith(500, 2);
  });

  it('omits requestedBy when nobody requested the item', async () => {
    const { service, handleNotification } = createService({
      media: [{ mediaServerId: '1', tmdbId: 500, addDate: dueAddDate() }],
      metadata: { title: 'Sample Movie', type: 'movie' },
      requestedBy: [],
    });

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(notifiedItems(handleNotification)[0]).not.toHaveProperty(
      'requestedBy',
    );
  });

  it('still notifies when the media server lookup throws', async () => {
    // Losing the title snapshot must not suppress the warning itself.
    const { service, handleNotification, getMetadata } = createService({
      media: [{ mediaServerId: '1', tmdbId: 500, addDate: dueAddDate() }],
      requestedBy: ['alice'],
    });
    getMetadata.mockRejectedValue(new Error('media server down'));

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(handleNotification).toHaveBeenCalledTimes(1);
    expect(notifiedItems(handleNotification)[0]).toMatchObject({
      mediaServerId: '1',
      requestedBy: ['alice'],
    });
  });

  it('skips the Seerr lookup for an item with no tmdbId', async () => {
    const { service, getRequestedByUsernames } = createService({
      media: [{ mediaServerId: '1', addDate: dueAddDate() }],
      metadata: { title: 'Sample Movie', type: 'movie' },
    });

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(getRequestedByUsernames).not.toHaveBeenCalled();
  });

  it('enriches each item once even when several agents notify it', async () => {
    const { service, getMetadata, getRequestedByUsernames } = createService({
      media: [{ mediaServerId: '1', tmdbId: 500, addDate: dueAddDate() }],
      metadata: { title: 'Sample Movie', type: 'movie' },
      requestedBy: ['alice'],
      agentCount: 3,
    });

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(getMetadata).toHaveBeenCalledTimes(1);
    expect(getRequestedByUsernames).toHaveBeenCalledTimes(1);
  });

  it('does not notify an item that is not due', async () => {
    const { service, handleNotification } = createService({
      media: [
        {
          mediaServerId: '1',
          tmdbId: 500,
          addDate: new Date().toISOString(),
        },
      ],
      metadata: { title: 'Sample Movie', type: 'movie' },
    });

    await (service as never as { executeTask(): Promise<void> }).executeTask();

    expect(handleNotification).not.toHaveBeenCalled();
  });
});
