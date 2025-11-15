import axios from 'axios';
import { MaintainerrLogger } from '../../logging/logs.service';
import { Notification } from '../entities/notification.entities';
import {
  NotificationAgentDiscord,
  NotificationAgentKey,
  NotificationType,
} from '../notifications-interfaces';
import { hasNotificationType } from '../notifications.service';
import type { NotificationAgent, NotificationPayload } from './agent';

enum EmbedColors {
  DEFAULT = 0,
  AQUA = 1752220,
  GREEN = 3066993,
  BLUE = 3447003,
  PURPLE = 10181046,
  GOLD = 15844367,
  ORANGE = 15105570,
  RED = 15158332,
  GREY = 9807270,
  DARKER_GREY = 8359053,
  NAVY = 3426654,
  DARK_AQUA = 1146986,
  DARK_GREEN = 2067276,
  DARK_BLUE = 2123412,
  DARK_PURPLE = 7419530,
  DARK_GOLD = 12745742,
  DARK_ORANGE = 11027200,
  DARK_RED = 10038562,
  DARK_GREY = 9936031,
  LIGHT_GREY = 12370112,
  DARK_NAVY = 2899536,
  LUMINOUS_VIVID_PINK = 16580705,
  DARK_VIVID_PINK = 12320855,
}

interface DiscordImageEmbed {
  url?: string;
  proxy_url?: string;
  height?: number;
  width?: number;
}

interface Field {
  name: string;
  value: string;
  inline?: boolean;
}
interface DiscordRichEmbed {
  title?: string;
  type?: 'rich'; // Always rich for webhooks
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: {
    text: string;
    icon_url?: string;
    proxy_icon_url?: string;
  };
  image?: DiscordImageEmbed;
  thumbnail?: DiscordImageEmbed;
  provider?: {
    name?: string;
    url?: string;
  };
  author?: {
    name?: string;
    url?: string;
    icon_url?: string;
    proxy_icon_url?: string;
  };
  fields?: Field[];
}

interface DiscordWebhookPayload {
  embeds: DiscordRichEmbed[];
  username?: string;
  avatar_url?: string;
  tts: boolean;
  content?: string;
}

class DiscordAgent implements NotificationAgent {
  constructor(
    private readonly settings: NotificationAgentDiscord,
    private readonly logger: MaintainerrLogger,
    readonly notification: Notification,
  ) {
    logger.setContext(DiscordAgent.name);
    this.notification = notification;
  }

  getNotification = () => this.notification;

  getSettings = () => this.settings;

  getIdentifier = () => NotificationAgentKey.DISCORD;

  public buildEmbed(
    type: NotificationType,
    payload: NotificationPayload,
  ): DiscordRichEmbed {
    const color = EmbedColors.DARK_PURPLE;
    const fields: Field[] = [];

    // for (const extra of payload.extra ?? []) {
    //   fields.push({
    //     name: extra.name,
    //     value: extra.value,
    //     inline: true,
    //   });
    // }
    return {
      title: payload.subject,
      description: payload.message,
      color,
      timestamp: new Date().toISOString(),
      fields,
      thumbnail: {
        url: payload.image,
      },
    };
  }

  public shouldSend(): boolean {
    if (this.getSettings().enabled && this.getSettings().options.webhookUrl) {
      return true;
    }

    return false;
  }

  public async send(
    type: NotificationType,
    payload: NotificationPayload,
  ): Promise<string> {
    if (!hasNotificationType(type, this.getSettings().types ?? [0])) {
      return 'Success';
    }

    this.logger.log('Sending Discord notification');

    try {
      await axios.post(this.getSettings().options.webhookUrl, {
        username: this.getSettings().options.botUsername
          ? this.getSettings().options.botUsername
          : 'Maintainerr',
        avatar_url: this.getSettings().options.botAvatarUrl,
        embeds: [this.buildEmbed(type, payload)],
      } as DiscordWebhookPayload);

      return 'Success';
    } catch (e) {
      this.logger.error(
        `Error sending Discord notification. Details: ${JSON.stringify({
          type: NotificationType[type],
          subject: payload.subject,
          response: e.response?.data,
        })}`,
        e,
      );

      return `Failure: ${e.message}`;
    }
  }
}

export default DiscordAgent;
