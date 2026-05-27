import axios from 'axios';
import { createMockLogger } from '../../../../test/utils/data';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentDiscord,
  NotificationAgentKey,
  NotificationType,
} from '../notifications-interfaces';
import DiscordAgent from './discord';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('DiscordAgent', () => {
  const webhookUrl = 'https://discord.com/api/webhooks/123/abc';

  const createAgent = () => {
    const notification = new Notification();
    const settings: NotificationAgentDiscord = {
      enabled: true,
      types: [NotificationType.TEST_NOTIFICATION],
      options: {
        agent: NotificationAgentKey.DISCORD,
        webhookUrl,
      },
    };

    return new DiscordAgent(settings, createMockLogger(), notification);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.post as jest.Mock).mockResolvedValue({});
  });

  it('omits the thumbnail when no image is provided', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
    });

    const [, body] = (axios.post as jest.Mock).mock.calls[0];
    expect(body.embeds[0]).not.toHaveProperty('thumbnail');
  });

  it('includes the thumbnail when an image is provided', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test subject',
      message: 'Test message',
      image: 'https://example.com/poster.jpg',
    });

    const [, body] = (axios.post as jest.Mock).mock.calls[0];
    expect(body.embeds[0].thumbnail).toEqual({
      url: 'https://example.com/poster.jpg',
    });
  });
});
