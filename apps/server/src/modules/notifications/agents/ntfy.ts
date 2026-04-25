import axios from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentKey,
  NotificationAgentNtfy,
  NotificationType,
} from '../notifications-interfaces';
import { hasNotificationType } from '../notifications.service';
import type { NotificationAgent, NotificationPayload } from './agent';

interface NtfyPayload {
  title: string;
  message: string;
}

class NtfyAgent implements NotificationAgent {
  public constructor(
    private readonly appSettings: SettingsService,
    private readonly settings: NotificationAgentNtfy,
    private readonly logger: MaintainerrLogger,
    readonly notification: Notification,
  ) {
    logger.setContext(NtfyAgent.name);
    this.notification = notification;
  }

  getNotification = () => this.notification;

  getSettings = () => this.settings;

  getIdentifier = () => NotificationAgentKey.NTFY;

  public shouldSend(): boolean {
    const settings = this.getSettings();

    if (settings.enabled && settings.options.url && settings.options.topic) {
      return true;
    }

    return false;
  }

  private getNotificationPayload(
    type: NotificationType,
    payload: NotificationPayload,
  ): NtfyPayload {
    const title = payload.subject;
    const message = payload.message ?? '';

    return {
      title,
      message,
    };
  }

  public async send(
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<string> {
    const settings = this.getSettings();

    if (!hasNotificationType(type, settings.types ?? [0])) {
      return 'Success';
    }

    this.logger.log('Sending Ntfy notification');

    try {
      const baseUrl = settings.options.url.replace(/\/+$/, '');
      const topic = settings.options.topic.replace(/^\/+/, '');
      const endpoint = `${baseUrl}/${topic}`;
      const notificationPayload = this.getNotificationPayload(type, payload);
      const headers: Record<string, string> = {
        Title: notificationPayload.title,
        'Content-Type': 'text/plain; charset=utf-8',
      };

      if (settings.options.token) {
        headers.Authorization = `Bearer ${settings.options.token}`;
      }

      await axios.post(endpoint, notificationPayload.message, {
        headers,
      });

      return 'Success';
    } catch (error) {
      const err = error as Error & { response?: { data?: unknown } };
      this.logger.error(
        `Error sending Ntfy notification. Details: ${JSON.stringify({
          type: NotificationType[type],
          subject: payload.subject,
          response: err.response?.data,
        })}`,
        error,
      );

      return `Failure: ${err.message}`;
    }
  }
}

export default NtfyAgent;
