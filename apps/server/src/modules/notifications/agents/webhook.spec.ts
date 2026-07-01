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
  const createAgent = (webhookUrl: string) => {
    const notification = new Notification();
    const settings: NotificationAgentWebhook = {
      enabled: true,
      types: [NotificationType.TEST_NOTIFICATION],
      options: {
        agent: NotificationAgentKey.WEBHOOK,
        webhookUrl,
        jsonPayload: '{}',
      },
    };

    return new WebhookAgent(
      {} as never,
      settings,
      createMockLogger(),
      notification,
    );
  };

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
});
