import axios from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { SettingsService } from '../../settings/settings.service';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentKey,
  NotificationAgentTelegram,
  NotificationType,
} from '../notifications-interfaces';
import { hasNotificationType } from '../notifications.service';
import type { NotificationAgent, NotificationPayload } from './agent';

interface TelegramMessagePayload {
  text: string;
  parse_mode: string;
  chat_id: string;
  disable_notification: boolean;
}

interface TelegramPhotoPayload {
  photo: string;
  caption: string;
  parse_mode: string;
  chat_id: string;
  disable_notification: boolean;
}

class TelegramAgent implements NotificationAgent {
  private baseUrl = 'https://api.telegram.org/';

  public constructor(
    private readonly appSettings: SettingsService,
    private readonly settings: NotificationAgentTelegram,
    private readonly logger: MaintainerrLogger,
    readonly notification: Notification,
  ) {
    logger.setContext(TelegramAgent.name);
    this.notification = notification;
  }

  getNotification = () => this.notification;

  getSettings = () => this.settings;

  getIdentifier = () => NotificationAgentKey.TELEGRAM;

  public shouldSend(): boolean {
    const settings = this.getSettings();

    if (settings.enabled && settings.options.botAuthToken) {
      return true;
    }

    return false;
  }

  private escapeText(text: string | undefined): string {
    return text ? text.replace(/[_*[\]()~>#+=|{}.!-]/gi, (x) => '\\' + x) : '';
  }

  private getNotificationPayload(
    type: NotificationType,
    payload: NotificationPayload,
  ): Partial<TelegramMessagePayload | TelegramPhotoPayload> {
    let message = `\*${this.escapeText(payload.subject)}\*`;
    if (payload.message) {
      message += `\n${this.escapeText(payload.message)}`;
    }

    // for (const extra of payload.extra ?? []) {
    //   message += `\n\*${extra.name}:\* ${extra.value}`;
    // }

    return payload.image
      ? {
          photo: payload.image,
          caption: message,
          parse_mode: 'MarkdownV2',
        }
      : {
          text: message,
          parse_mode: 'MarkdownV2',
        };
  }

  public async send(
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<string> {
    const settings = this.getSettings();
    const endpoint = `${this.baseUrl}bot${settings.options.botAuthToken}/${
      payload.image ? 'sendPhoto' : 'sendMessage'
    }`;
    const notificationPayload = this.getNotificationPayload(type, payload);

    if (
      hasNotificationType(type, settings.types ?? [0]) &&
      settings.options.chatId
    ) {
      this.logger.log('Sending Telegram notification');

      try {
        await axios.post(endpoint, {
          ...notificationPayload,
          chat_id: settings.options.chatId,
          disable_notification: !!settings.options.sendSilently,
        } as TelegramMessagePayload | TelegramPhotoPayload);
      } catch (e) {
        this.logger.error(
          `Error sending Telegram notification. Details: ${JSON.stringify({
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

export default TelegramAgent;
