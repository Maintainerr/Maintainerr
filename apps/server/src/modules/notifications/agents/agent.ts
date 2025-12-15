import { Notification } from '../entities/notification.entities';
import {
  AnyNotificationAgentConfig,
  NotificationAgentKey,
  NotificationType,
} from '../notifications-interfaces';

export interface NotificationPayload {
  subject: string;
  image?: string;
  message?: string;
  extra?: { name: string; value: string }[];
}

export interface NotificationAgent {
  notification: Notification;
  shouldSend(): boolean;
  send(type: NotificationType, payload: NotificationPayload): Promise<string>;
  getIdentifier(): NotificationAgentKey;
  getSettings(): AnyNotificationAgentConfig;
  getNotification(): Notification;
}
