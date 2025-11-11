import axios from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentKey,
  NotificationAgentPushover,
  NotificationType,
} from '../notifications-interfaces';
import { hasNotificationType } from '../notifications.service';
import type { NotificationAgent, NotificationPayload } from './agent';

interface PushoverImagePayload {
  attachment_base64: string;
  attachment_type: string;
}

interface PushoverPayload extends PushoverImagePayload {
  token: string;
  user: string;
  title: string;
  message: string;
  url: string;
  url_title: string;
  priority: number;
  html: number;
}

class PushoverAgent implements NotificationAgent {
  public constructor(
    private readonly appSettings: SettingsService,
    private readonly settings: NotificationAgentPushover,
    private readonly logger: MaintainerrLogger,
    readonly notification: Notification,
  ) {
    logger.setContext(PushoverAgent.name);
    this.notification = notification;
  }

  getNotification = () => this.notification;

  getSettings = () => this.settings;

  getIdentifier = () => NotificationAgentKey.PUSHOVER;

  public shouldSend(): boolean {
    if (
      this.settings.enabled &&
      this.settings.options.accessToken &&
      this.settings.options.userToken
    ) {
      return true;
    }
    return false;
  }

  private async getImagePayload(
    imageUrl: string,
  ): Promise<Partial<PushoverImagePayload>> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });
      const base64 = Buffer.from(response.data, 'binary').toString('base64');
      const contentType = (
        response.headers['Content-Type'] || response.headers['content-type']
      )?.toString();

      return {
        attachment_base64: base64,
        attachment_type: contentType,
      };
    } catch (e) {
      this.logger.error(`Error getting image payload`, e);
      return {};
    }
  }

  private async getNotificationPayload(
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<Partial<PushoverPayload>> {
    const title = payload.subject;
    let message = `<b>${payload.subject}</b>`;
    const priority = 0;

    if (payload.message) {
      message += `<small>${message ? '\n' : ''}${payload.message}</small>`;
    }

    // for (const extra of payload.extra ?? []) {
    //   message += `<small>\n<b>${extra.name}:</b> ${extra.value}</small>`;
    // }

    let attachment_base64;
    let attachment_type;
    if (payload.image) {
      const imagePayload = await this.getImagePayload(payload.image);
      if (imagePayload.attachment_base64 && imagePayload.attachment_type) {
        attachment_base64 = imagePayload.attachment_base64;
        attachment_type = imagePayload.attachment_type;
      }
    }

    return {
      title,
      message,
      priority,
      html: 1,
      attachment_base64,
      attachment_type,
    };
  }

  public async send(
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<string> {
    const settings = this.getSettings();
    const endpoint = 'https://api.pushover.net/1/messages.json';
    const notificationPayload = await this.getNotificationPayload(
      type,
      payload,
    );

    // Send notification
    if (hasNotificationType(type, settings.types ?? [0]) && this.shouldSend()) {
      this.logger.log('Sending Pushover notification');

      try {
        await axios.post(endpoint, {
          ...notificationPayload,
          token: settings.options.accessToken,
          user: settings.options.userToken,
          sound: settings.options.sound,
        } as PushoverPayload);
      } catch (e) {
        this.logger.error(
          `Error sending Pushover notification. Details: ${JSON.stringify({
            type: NotificationType[type],
            subject: payload.subject,
            response: e.response?.data,
          })}`,
          e,
        );
        return `Failure: ${e.message}`;
      }
    }

    return 'Success';
  }
}

export default PushoverAgent;
