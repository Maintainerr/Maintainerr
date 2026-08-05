import nodemailer from 'nodemailer';
import { createMockLogger } from '../../../../test/utils/data';
import { SettingsDataService } from '../../settings/settings-data.service';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentEmail,
  NotificationAgentKey,
  NotificationType,
} from '../notifications-interfaces';
import EmailAgent from './email';

const sendMail = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({
      sendMail: (...args: unknown[]) => sendMail(...args),
      use: jest.fn(),
    })),
  },
}));

describe('EmailAgent', () => {
  const createAgent = () => {
    const settings: NotificationAgentEmail = {
      enabled: true,
      types: [],
      options: {
        agent: NotificationAgentKey.EMAIL,
        emailFrom: 'maintainerr@example.com',
        emailTo: 'admin@example.com',
        senderName: 'Maintainerr',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
      },
    } as NotificationAgentEmail;

    return new EmailAgent(
      {} as SettingsDataService,
      settings,
      createMockLogger(),
      new Notification(),
    );
  };

  const renderedHtml = () => sendMail.mock.calls[0][0].html as string;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'test' });
    (nodemailer.createTransport as jest.Mock).mockClear();
  });

  it('escapes HTML in the message body', async () => {
    const agent = createAgent();

    const result = await agent.send(
      NotificationType.MEDIA_ADDED_TO_COLLECTION,
      {
        subject: 'Media Added to Collection',
        message:
          "📂 '<img src=x onerror=\"alert(1)\">' has been added to 'Sample Collection'.",
      },
    );

    expect(result).toBe('Success');

    const html = renderedHtml();
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    // The Maintainerr logo is the only tag the template is allowed to emit.
    expect(html.split('<img').length - 1).toBe(1);
  });

  it('keeps line breaks in the message body', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.MEDIA_ABOUT_TO_BE_HANDLED, {
      subject: 'Media About to be Handled',
      message: 'First line\nSecond line',
    });

    expect(renderedHtml()).toContain('First line<br>Second line');
  });

  it('escapes HTML in the test notification body too', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.TEST_NOTIFICATION, {
      subject: 'Test Notification',
      message: '<script>alert(1)</script>',
    });

    const html = renderedHtml();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not double-escape an ampersand', async () => {
    const agent = createAgent();

    await agent.send(NotificationType.MEDIA_ADDED_TO_COLLECTION, {
      subject: 'Media Added to Collection',
      message: 'Sample Show & Friends',
    });

    const html = renderedHtml();
    expect(html).toContain('Sample Show &amp; Friends');
    expect(html).not.toContain('&amp;amp;');
  });
});
