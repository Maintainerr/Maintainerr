import axios from 'axios';
import { hasNotificationType } from '../notifications.service';
import type { NotificationAgent, NotificationPayload } from './agent';
import { SettingsService } from '../../settings/settings.service';
import { Logger } from '@nestjs/common';
import {
  NotificationAgentKey,
  NotificationAgentSlack,
  NotificationType,
} from '../notifications-interfaces';
import { Notification } from '../entities/notification.entities';

interface EmbedField {
  type: 'plain_text' | 'mrkdwn';
  text: string;
}

interface TextItem {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

interface Element {
  type: 'button';
  text?: TextItem;
  action_id: string;
  url?: string;
  value?: string;
  style?: 'primary' | 'danger';
}

interface EmbedBlock {
  type: 'header' | 'actions' | 'section' | 'context';
  block_id?: 'section789';
  text?: TextItem;
  fields?: EmbedField[];
  accessory?: {
    type: 'image';
    image_url: string;
    alt_text: string;
  };
  elements?: (Element | TextItem)[];
}

interface SlackBlockEmbed {
  text: string;
  blocks: EmbedBlock[];
}

class SlackAgent implements NotificationAgent {
  public constructor(
    private readonly appSettings: SettingsService,
    private readonly settings: NotificationAgentSlack,
    readonly notification: Notification,
  ) {
    this.notification = notification;
  }

  private readonly logger = new Logger(SlackAgent.name);

  getNotification = () => this.notification;

  getSettings = () => this.settings;

  getIdentifier = () => NotificationAgentKey.SLACK;

  public buildEmbed(
    type: NotificationType,
    payload: NotificationPayload,
  ): SlackBlockEmbed {
    const fields: EmbedField[] = [];

    // for (const extra of payload.extra ?? []) {
    //   fields.push({
    //     type: 'mrkdwn',
    //     text: `*${extra.name}*\n${extra.value}`,
    //   });
    // }

    const blocks: EmbedBlock[] = [];

    if (payload.event) {
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*${payload.event}*`,
          },
        ],
      });
    }

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: payload.subject,
      },
    });

    if (payload.message) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: payload.message,
        },
        accessory: payload.image
          ? {
              type: 'image',
              image_url: payload.image,
              alt_text: payload.subject,
            }
          : undefined,
      });
    }

    if (fields.length > 0) {
      blocks.push({
        type: 'section',
        fields,
      });
    }

    return {
      text: payload.event ?? payload.subject,
      blocks,
    };
  }

  public shouldSend(): boolean {
    const settings = this.getSettings();

    if (settings.enabled && settings.options.webhookUrl) {
      return true;
    }

    return false;
  }

  public async send(
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<string> {
    const settings = this.getSettings();

    if (!hasNotificationType(type, settings.types ?? [0])) {
      return 'Success';
    }

    this.logger.log('Sending Slack notification');
    try {
      await axios.post(
        settings.options.webhookUrl as string,
        this.buildEmbed(type, payload),
      );

      return 'Success';
    } catch (e) {
      this.logger.error(
        `Error sending Slack notification. Details: ${JSON.stringify({
          type: NotificationType[type],
          subject: payload.subject,
          errorMessage: e.message,
          response: e.response?.data,
        })}`,
      );
      this.logger.debug(e);
      return `Failure: ${e.message}`;
    }
  }
}

export default SlackAgent;
