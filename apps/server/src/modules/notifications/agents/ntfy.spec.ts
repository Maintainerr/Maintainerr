import { rateLimitAwareHttp } from '../../api/lib/httpRetry';
import { createMockLogger } from '../../../../test/utils/data';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentKey,
  NotificationAgentNtfy,
  NotificationType,
} from '../notifications-interfaces';
import NtfyAgent from './ntfy';

jest.mock('../../api/lib/httpRetry', () => ({
  rateLimitAwareHttp: { post: jest.fn() },
}));

const { post } = rateLimitAwareHttp as unknown as { post: jest.Mock };

describe('NtfyAgent', () => {
  const createAgent = (token?: string, url = 'https://ntfy.sh/') => {
    const notification = new Notification();
    const settings: NotificationAgentNtfy = {
      enabled: true,
      types: [NotificationType.TEST_NOTIFICATION],
      options: {
        agent: NotificationAgentKey.NTFY,
        url,
        topic: '/maintainerr',
        ...(token ? { token } : {}),
      },
    };

    return new NtfyAgent({} as any, settings, createMockLogger(), notification);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({});
  });

  it('allows public topics without a token', () => {
    const agent = createAgent();

    expect(agent.shouldSend()).toBe(true);
  });

  it('rejects a non-http(s) URL without posting', async () => {
    const agent = createAgent(undefined, 'file:///etc/passwd');

    const result = await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    expect(result).toBe('Failure: unsupported webhook URL scheme');
    expect(post).not.toHaveBeenCalled();
  });

  it('omits the authorization header when no token is configured', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    expect(post).toHaveBeenCalledWith(
      'https://ntfy.sh/maintainerr',
      'Test message',
      {
        headers: {
          Title: 'Test subject',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      },
    );
  });

  it('sends bearer auth when a token is configured', async () => {
    const agent = createAgent('secret-token');

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    expect(post).toHaveBeenCalledWith(
      'https://ntfy.sh/maintainerr',
      'Test message',
      {
        headers: {
          Authorization: 'Bearer secret-token',
          Title: 'Test subject',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      },
    );
  });
});
