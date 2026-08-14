import { rateLimitAwareHttp } from '../../api/lib/httpRetry';
import { createMockLogger } from '../../../../test/utils/data';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentKey,
  NotificationAgentSlack,
  NotificationType,
} from '../notifications-interfaces';
import SlackAgent from './slack';

jest.mock('../../api/lib/httpRetry', () => ({
  rateLimitAwareHttp: { post: jest.fn() },
}));

const { post } = rateLimitAwareHttp as unknown as { post: jest.Mock };

describe('SlackAgent', () => {
  const createAgent = (webhookUrl: string) => {
    const notification = new Notification();
    const settings: NotificationAgentSlack = {
      enabled: true,
      types: [NotificationType.TEST_NOTIFICATION],
      options: {
        agent: NotificationAgentKey.SLACK,
        webhookUrl,
      },
    };

    return new SlackAgent(
      {} as never,
      settings,
      createMockLogger(),
      notification,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({});
  });

  it('rejects a non-http(s) webhook URL without posting', async () => {
    const agent = createAgent('file:///etc/passwd');

    const result = await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    expect(result).toBe('Failure: unsupported webhook URL scheme');
    expect(post).not.toHaveBeenCalled();
  });

  it('posts to the normalised URL for a valid webhook', async () => {
    const agent = createAgent('https://example.com');

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('https://example.com/');
  });
});
