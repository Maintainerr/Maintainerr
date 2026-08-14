import { rateLimitAwareHttp } from '../../api/lib/httpRetry';
import { createMockLogger } from '../../../../test/utils/data';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentDiscord,
  NotificationAgentKey,
  NotificationType,
} from '../notifications-interfaces';
import DiscordAgent from './discord';

jest.mock('../../api/lib/httpRetry', () => ({
  rateLimitAwareHttp: { post: jest.fn() },
}));

const { post } = rateLimitAwareHttp as unknown as { post: jest.Mock };

describe('DiscordAgent', () => {
  const webhookUrl = 'https://discord.com/api/webhooks/123/abc';

  const createAgent = (url: string = webhookUrl) => {
    const notification = new Notification();
    const settings: NotificationAgentDiscord = {
      enabled: true,
      types: [NotificationType.TEST_NOTIFICATION],
      options: {
        agent: NotificationAgentKey.DISCORD,
        webhookUrl: url,
      },
    };

    return new DiscordAgent(settings, createMockLogger(), notification);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({});
  });

  it('omits the thumbnail when no image is provided', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    const [, body] = post.mock.calls[0];
    expect(body.embeds[0]).not.toHaveProperty('thumbnail');
  });

  it('includes the thumbnail when an image is provided', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
      image: 'https://example.com/poster.jpg',
    });

    const [, body] = post.mock.calls[0];
    expect(body.embeds[0].thumbnail).toEqual({
      url: 'https://example.com/poster.jpg',
    });
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

  it('trims a batched message to the embed description limit', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'x'.repeat(5000),
    });

    const [, body] = post.mock.calls[0];
    expect(body.embeds[0].description).toHaveLength(4096);
    expect(body.embeds[0].description.endsWith('\n...')).toBe(true);
  });
});
