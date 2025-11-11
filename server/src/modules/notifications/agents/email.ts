import type { EmailOptions } from 'email-templates';
import path from 'path';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import PreparedEmail from '../email/preparedEmail';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentEmail,
  NotificationAgentKey,
  NotificationType,
} from '../notifications-interfaces';
import type { NotificationAgent, NotificationPayload } from './agent';

class EmailAgent implements NotificationAgent {
  public constructor(
    private readonly appSettings: SettingsService,
    private readonly settings: NotificationAgentEmail,
    private readonly logger: MaintainerrLogger,
    readonly notification: Notification,
  ) {
    logger.setContext(EmailAgent.name);
    this.notification = notification;
  }

  getNotification = () => this.notification;

  getSettings = () => this.settings;
  getIdentifier = () => NotificationAgentKey.EMAIL;

  public shouldSend(): boolean {
    const settings = this.getSettings();

    if (
      settings.enabled &&
      settings.options.emailFrom &&
      settings.options.emailTo &&
      settings.options.smtpHost &&
      settings.options.smtpPort
    ) {
      return true;
    }

    return false;
  }

  private buildMessage(
    type: NotificationType,
    payload: NotificationPayload,
    recipientEmail: string,
  ): EmailOptions | undefined {
    if (type === NotificationType.TEST_NOTIFICATION) {
      return {
        template: path.join(__dirname, '../email/templates/test-email'),
        message: {
          to: recipientEmail,
        },
        locals: {
          body: payload.message.replaceAll('\n', '<br>'),
          recipientEmail,
        },
      };
    }

    return {
      template: path.join(__dirname, '../email/templates/email-template'),
      message: {
        to: recipientEmail,
      },
      locals: {
        subject: payload.subject,
        body: payload.message.replaceAll('\n', '<br>'),
        extra: payload.extra ?? [],
        imageUrl: payload.image,
        timestamp: new Date().toTimeString(),
        recipientEmail,
      },
    };
  }

  public async send(
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<string> {
    this.logger.log('Sending email notification');

    try {
      const email = new PreparedEmail(this.getSettings());
      await email.send(
        this.buildMessage(type, payload, this.getSettings().options.emailTo),
      );
    } catch (e) {
      this.logger.error(
        `Error sending Email notification. Details: ${JSON.stringify({
          type: NotificationType[type],
          subject: payload.subject,
          response: e.response?.data,
        })}`,
        e,
      );

      return `Failure: ${e.message}`;
    }

    return 'Success';
  }
}

export default EmailAgent;
