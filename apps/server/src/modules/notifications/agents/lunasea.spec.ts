import axios from 'axios';
import { createMockLogger } from '../../../../test/utils/data';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentKey,
  NotificationAgentLunaSea,
  NotificationType,
} from '../notifications-interfaces';
import LunaSeaAgent from './lunasea';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('LunaSeaAgent', () => {
  const createAgent = (webhookUrl: string) => {
    const notification = new Notification();
    const settings: NotificationAgentLunaSea = {
      enabled: true,
      types: [NotificationType.TEST_NOTIFICATION],
      options: {
        agent: NotificationAgentKey.LUNASEA,
        webhookUrl,
      },
    };

    return new LunaSeaAgent(
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

  it('posts to the normalised URL for a valid webhook', async () => {
    const agent = createAgent('https://example.com');

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect((axios.post as jest.Mock).mock.calls[0][0]).toBe(
      'https://example.com/',
    );
  });
});
