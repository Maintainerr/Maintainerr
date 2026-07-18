import axios from 'axios';
import { createMockLogger } from '../../../../test/utils/data';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentKey,
  NotificationAgentWebhook,
  NotificationType,
} from '../notifications-interfaces';
import WebhookAgent from './webhook';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('WebhookAgent', () => {
  const createAgent = (
    webhookUrl: string,
    // The UI JSON.parses the editor contents before saving, so a stored
    // jsonPayload is an object - not the string the type claims.
    jsonPayload: unknown = {},
  ) => {
    const notification = new Notification();
    const settings: NotificationAgentWebhook = {
      enabled: true,
      types: [NotificationType.TEST_NOTIFICATION],
      options: {
        agent: NotificationAgentKey.WEBHOOK,
        webhookUrl,
        jsonPayload: jsonPayload as string,
      },
    };

    return new WebhookAgent(
      {} as never,
      settings,
      createMockLogger(),
      notification,
    );
  };

  const postedBody = () => (axios.post as jest.Mock).mock.calls[0][1];

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.post as jest.Mock).mockResolvedValue({});
  });

  it('rejects a non-http(s) webhook URL without posting', async () => {
    const agent = createAgent('file:///etc/passwd');

    const result = await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    expect(result).toBe('Failure: unsupported webhook URL scheme');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('flattens extras onto the posted body', async () => {
    const agent = createAgent('https://example.com/hook');

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      extra: [{ name: 'collectionName', value: 'Stale Movies' }],
    });

    expect(postedBody()).toMatchObject({
      subject: 'Test subject',
      collectionName: 'Stale Movies',
    });
  });

  it('resolves the {{extra}} template key to the real extras', async () => {
    // Regression: buildPayload deleted payload.extra before parseKeys read it,
    // so a templated {{extra}} always came out as an empty array.
    const agent = createAgent('https://example.com/hook', { '{{extra}}': '' });
    const extra = [{ name: 'dayAmount', value: '3' }];

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      extra,
    });

    expect(postedBody().extra).toEqual(extra);
  });

  it('does not mutate the payload shared with the other agents', async () => {
    // Regression: buildPayload used to `delete payload.extra` on the object
    // shared with every other agent, stripping extras from whoever ran next.
    const agent = createAgent('https://example.com/hook');
    const payload = {
      subject: 'Test subject',
      extra: [{ name: 'collectionName', value: 'Stale Movies' }],
    };

    await agent.send(NotificationType.TEST_NOTIFICATION, payload);

    expect(payload.extra).toEqual([
      { name: 'collectionName', value: 'Stale Movies' },
    ]);
    expect(payload).not.toHaveProperty('collectionName');
  });

  it('carries requestedBy through to the posted body', async () => {
    const agent = createAgent('https://example.com/hook');
    const mediaItems = JSON.stringify([
      { mediaServerId: '1', requestedBy: ['alice'] },
    ]);

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Media About to be Handled',
      extra: [{ name: 'mediaItems', value: mediaItems }],
    });

    expect(JSON.parse(postedBody().mediaItems)).toEqual([
      { mediaServerId: '1', requestedBy: ['alice'] },
    ]);
  });
});
