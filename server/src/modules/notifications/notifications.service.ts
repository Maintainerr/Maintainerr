import { BasicResponseDto, MaintainerrEvent } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import _ from 'lodash';
import { DataSource, Repository } from 'typeorm';
import { PlexMetadata } from '../api/plex-api/interfaces/media.interface';
import { PlexApiService } from '../api/plex-api/plex-api.service';
import {
  CollectionMediaAddedDto,
  CollectionMediaHandledDto,
  CollectionMediaRemovedDto,
  RuleHandlerFailedDto,
} from '../events/events.dto';
import {
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from '../logging/logs.service';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { SettingsService } from '../settings/settings.service';
import type { NotificationAgent, NotificationPayload } from './agents/agent';
import DiscordAgent from './agents/discord';
import EmailAgent from './agents/email';
import GotifyAgent from './agents/gotify';
import LunaSeaAgent from './agents/lunasea';
import PushbulletAgent from './agents/pushbullet';
import PushoverAgent from './agents/pushover';
import SlackAgent from './agents/slack';
import TelegramAgent from './agents/telegram';
import WebhookAgent from './agents/webhook';
import { Notification } from './entities/notification.entities';
import {
  DiscordOptions,
  EmailOptions,
  GotifyOptions,
  LunaSeaOptions,
  NotificationAgentKey,
  NotificationAgentOptions,
  NotificationType,
  PushbulletOptions,
  PushoverOptions,
  SlackOptions,
  TelegramOptions,
  WebhookOptions,
} from './notifications-interfaces';

export const hasNotificationType = (
  type: NotificationType,
  value: NotificationType[],
): boolean => {
  return value.includes(type);
};

@Injectable()
export class NotificationService {
  private activeAgents: NotificationAgent[] = [];

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(RuleGroup)
    private readonly ruleGroupRepo: Repository<RuleGroup>,
    private readonly connection: DataSource,
    private readonly settings: SettingsService,
    private readonly plexApi: PlexApiService,
    private readonly logger: MaintainerrLogger,
    private readonly loggerFactory: MaintainerrLoggerFactory,
  ) {
    logger.setContext(NotificationService.name);
  }

  public registerAgents = (
    agents: NotificationAgent[],
    skiplog = false,
  ): void => {
    this.activeAgents = [...this.activeAgents, ...agents];

    if (!skiplog) {
      this.logger.log(
        `Registered ${agents.length} notification agent${agents.length === 1 ? '' : 's'}`,
      );
    }
  };

  public getActiveAgents = () => {
    return this.activeAgents;
  };

  public async sendNotification(
    type: NotificationType,
    payload: NotificationPayload,
    rulegroup?: RuleGroup,
  ): Promise<void> {
    await Promise.allSettled(
      this.activeAgents.map(async (agent) => {
        // if rulegroup is supplied, then only send the notification if configured
        if (
          rulegroup == undefined ||
          rulegroup?.notifications?.find(
            (n) => n.id === agent.getNotification().id,
          )
        )
          await this.sendNotificationToAgent(type, payload, agent);
      }),
    );
  }

  public async sendNotificationToAgent(
    type: NotificationType,
    payload: NotificationPayload,
    agent: NotificationAgent,
  ): Promise<string> {
    if (agent.shouldSend()) {
      if (agent.getSettings().types?.includes(type))
        return await agent.send(type, payload);
    }
    return Promise.resolve('Agent is not allowed to send this message.');
  }

  async addNotificationConfiguration(payload: {
    id?: number;
    agent: NotificationAgentKey;
    name: string;
    enabled: boolean;
    types: number[];
    aboutScale: number;
    options: NotificationAgentOptions;
  }): Promise<BasicResponseDto> {
    try {
      if (payload.id !== undefined) {
        // update
        await this.connection
          .createQueryBuilder()
          .update(Notification)
          .set({
            name: payload.name,
            agent: payload.agent,
            enabled: payload.enabled,
            aboutScale: payload.aboutScale,
            types: payload.types,
            options: payload.options,
          })
          .where('id = :id', { id: payload.id })
          .execute();
      } else {
        await this.connection
          .createQueryBuilder()
          .insert()
          .into(Notification)
          .values({
            name: payload.name,
            agent: payload.agent,
            enabled: payload.enabled,
            aboutScale: payload.aboutScale,
            types: payload.types,
            options: payload.options,
          })
          .execute();
      }

      // reset & reload notification agents
      await this.registerConfiguredAgents(true);
      return { code: 1, status: 'OK', message: 'Success' };
    } catch (err) {
      this.logger.error('Adding a new notification configuration failed', err);
      return { code: 0, status: 'NOK', message: err };
    }
  }

  async connectNotificationConfigurationToRule(payload: {
    rulegroupId: number;
    notificationId: number;
  }) {
    try {
      if (payload.rulegroupId && payload.notificationId) {
        const ruleGroup = await this.ruleGroupRepo.findOne({
          where: { id: payload.rulegroupId },
        });

        const notificationConfig = await this.notificationRepo.findOne({
          where: { id: payload.notificationId },
        });

        if (ruleGroup && notificationConfig) {
          ruleGroup.notifications.push(notificationConfig);
          await this.ruleGroupRepo.save(ruleGroup);
          return { code: 1, result: 'success' };
        }
      }
      this.logger.warn('Connecting the notification configuration failed');
      return { code: 0, result: 'failed' };
    } catch (err) {
      this.logger.error(
        'Connecting the notification configuration failed',
        err,
      );
      return { code: 0, result: err };
    }
  }

  async disconnectNotificationConfigurationFromRule(payload: {
    rulegroupId: number;
    notificationId: number;
  }) {
    try {
      const ruleGroup = await this.ruleGroupRepo.findOne({
        where: { id: payload.rulegroupId },
      });

      const notificationConfig = await this.notificationRepo.findOne({
        where: { id: payload.notificationId },
      });

      if (ruleGroup && notificationConfig) {
        ruleGroup.notifications = ruleGroup.notifications.filter(
          (c) => c.id !== payload.notificationId,
        );
        await this.ruleGroupRepo.save(ruleGroup);
        return { code: 1, result: 'success' };
      }

      return { code: 0, result: 'failed' };
    } catch (err) {
      this.logger.error(
        'Disconnecting the notification configuration failed',
        err,
      );
      return { code: 0, result: err };
    }
  }

  async getNotificationConfigurations(withRelation = false) {
    try {
      if (withRelation) {
        const notifConfigs = await this.notificationRepo.find();
        // hack to get the relationship working. I was tired of the typeORM headache
        return await Promise.all(
          notifConfigs.map(async (n) => {
            n.rulegroups = await this.ruleGroupRepo.find({
              where: { notifications: { id: n.id } },
            });
            return n;
          }),
        );
      }

      return await this.notificationRepo.find();
    } catch (err) {
      this.logger.error('Fetching Notification configurations failed', err);
    }
  }

  public createDummyTestAgent(payload: {
    id?: number;
    agent: NotificationAgentKey;
    name: string;
    enabled: boolean;
    types: number[];
    aboutScale: number;
    options: NotificationAgentOptions;
  }) {
    payload.types = [...payload.types, NotificationType.TEST_NOTIFICATION];

    const notification = new Notification();
    notification.id = -1;
    notification.agent = payload.agent;
    notification.enabled = payload.enabled;
    notification.aboutScale = payload.aboutScale;
    notification.name = payload.name;
    notification.options = payload.options;
    notification.types = payload.types;

    return this.createAgent(notification);
  }

  public async registerConfiguredAgents(skiplog = false) {
    const configuredAgents = await this.getNotificationConfigurations();

    const isEqual = (a: Notification[], b: Notification[]) =>
      _.isEqual(_.sortBy(a, 'id'), _.sortBy(b, 'id'));

    const notifications = this.activeAgents.map((e) => e.getNotification());

    // Only (re-)register agents when required
    if (!isEqual(notifications, configuredAgents)) {
      this.activeAgents = [];

      const agents: NotificationAgent[] = configuredAgents?.map(
        (notification) => this.createAgent(notification),
      );

      this.registerAgents(agents, skiplog);
    }
  }

  private createAgent(notification: Notification) {
    switch (notification.agent as NotificationAgentKey) {
      case NotificationAgentKey.DISCORD:
        return new DiscordAgent(
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as DiscordOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.PUSHOVER:
        return new PushoverAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as PushoverOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.EMAIL:
        return new EmailAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as EmailOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.GOTIFY:
        return new GotifyAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as GotifyOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.LUNASEA:
        return new LunaSeaAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as LunaSeaOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.PUSHBULLET:
        return new PushbulletAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as PushbulletOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.SLACK:
        return new SlackAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as SlackOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.TELEGRAM:
        return new TelegramAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as TelegramOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
      case NotificationAgentKey.WEBHOOK:
        return new WebhookAgent(
          this.settings,
          {
            enabled: notification.enabled,
            types: notification.types,
            options: notification.options as WebhookOptions,
          },
          this.loggerFactory.createLogger(),
          notification,
        );
    }
  }

  async deleteNotificationConfiguration(notificationId: number) {
    try {
      await this.notificationRepo.delete(notificationId);

      // reset & reload notification agents
      await this.registerConfiguredAgents(true);

      return { code: 1, result: 'success' };
    } catch (err) {
      this.logger.error('Notification configuration removal failed', err);
      return { code: 0, result: err };
    }
  }

  public getTypes() {
    return Object.keys(NotificationType)
      .filter(
        (key) =>
          isNaN(Number(key)) &&
          NotificationType[key] !== NotificationType.TEST_NOTIFICATION,
      )
      .map((key) => ({
        title: this.humanizeTitle(key),
        id: NotificationType[key],
      }));
  }

  // Helper function to convert enum keys to human-readable titles
  private humanizeTitle(key: string): string {
    return key
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  public getAgentSpec() {
    return [
      {
        name: NotificationAgentKey.EMAIL,
        friendlyName: 'Email',
        options: [
          { field: 'emailFrom', type: 'text', required: true, extraInfo: '' },
          { field: 'senderName', type: 'text', required: true, extraInfo: '' },
          { field: 'emailTo', type: 'text', required: true, extraInfo: '' },
          { field: 'smtpHost', type: 'text', required: true, extraInfo: '' },
          { field: 'smtpPort', type: 'number', required: true, extraInfo: '' },
          {
            field: 'secure',
            type: 'checkbox',
            required: false,
            extraInfo: 'TLS: Use implicit TLS',
          },
          {
            field: 'ignoreTls',
            type: 'checkbox',
            required: false,
            extraInfo: 'TLS: None',
          },
          {
            field: 'requireTls',
            type: 'checkbox',
            required: false,
            extraInfo: 'TLS: Always use STARTLS',
          },
          { field: 'authUser', type: 'text', required: false, extraInfo: '' },
          {
            field: 'authPass',
            type: 'password',
            required: false,
            extraInfo: '',
          },
          {
            field: 'allowSelfSigned',
            type: 'checkbox',
            required: false,
            extraInfo: '',
          },
          { field: 'pgpKey', type: 'text', required: false, extraInfo: '' },
          {
            field: 'pgpPassword',
            type: 'password',
            required: false,
            extraInfo: '',
          },
        ],
      },
      {
        name: NotificationAgentKey.DISCORD,
        friendlyName: 'Discord',
        options: [
          { field: 'webhookUrl', type: 'text', required: true, extraInfo: '' },
          {
            field: 'botUsername',
            type: 'text',
            required: false,
            extraInfo: '',
          },
          {
            field: 'botAvatarUrl',
            type: 'text',
            required: false,
            extraInfo: '',
          },
        ],
      },
      {
        name: NotificationAgentKey.LUNASEA,
        friendlyName: 'LunaSea',
        options: [
          { field: 'webhookUrl', type: 'text', required: true, extraInfo: '' },
          {
            field: 'profileName',
            type: 'text',
            required: false,
            extraInfo: 'Only required if not using the default profile',
          },
        ],
      },
      {
        name: NotificationAgentKey.SLACK,
        friendlyName: 'Slack',
        options: [
          { field: 'webhookUrl', type: 'text', required: true, extraInfo: '' },
        ],
      },
      {
        name: NotificationAgentKey.TELEGRAM,
        friendlyName: 'Telegram',
        options: [
          {
            field: 'botAuthToken',
            type: 'text',
            required: true,
            extraInfo: '',
          },
          {
            field: 'botUsername',
            type: 'text',
            required: false,
            extraInfo:
              'Allow users to also start a chat with your bot and configure their own notifications',
          },
          {
            field: 'chatId',
            type: 'text',
            required: true,
            extraInfo:
              'Start a chat with your bot, add @get_id_bot, and issue the /my_id command',
          },
          {
            field: 'sendSilently',
            type: 'checkbox',
            required: false,
            extraInfo: 'Send notifications with no sound',
          },
        ],
      },
      {
        name: NotificationAgentKey.PUSHBULLET,
        friendlyName: 'Pushbullet',
        options: [
          { field: 'accessToken', type: 'text', required: true, extraInfo: '' },
          { field: 'channelTag', type: 'text', required: false, extraInfo: '' },
        ],
      },
      {
        name: NotificationAgentKey.PUSHOVER,
        friendlyName: 'Pushover',
        options: [
          { field: 'accessToken', type: 'text', required: true, extraInfo: '' },
          {
            field: 'userToken',
            type: 'text',
            required: true,
            extraInfo: 'Your 30-character user or group identifier',
          },
          { field: 'sound', type: 'text', required: false, extraInfo: '' },
        ],
      },
      {
        name: NotificationAgentKey.WEBHOOK,
        friendlyName: 'Webhook',
        options: [
          { field: 'webhookUrl', type: 'text', required: true, extraInfo: '' },
          { field: 'jsonPayload', type: 'json', required: true, extraInfo: '' },
          { field: 'authHeader', type: 'text', required: false, extraInfo: '' },
        ],
      },
      {
        name: NotificationAgentKey.GOTIFY,
        friendlyName: 'Gotify',
        options: [
          { field: 'url', type: 'text', required: true, extraInfo: '' },
          { field: 'token', type: 'text', required: true, extraInfo: '' },
        ],
      },
    ];
  }

  public async handleNotification(
    type: NotificationType,
    mediaItems?: { plexId: number }[],
    collectionName?: string,
    dayAmount?: number,
    agent?: NotificationAgent,
    identifier?: { type: string; value: number },
  ) {
    const { subject, message } = this.getContent(
      type,
      mediaItems && mediaItems.length > 1,
    );

    const payload: NotificationPayload = {
      subject,
      message,
    };

    payload.message = await this.transformMessageContent(
      message,
      mediaItems,
      collectionName,
      dayAmount,
    );

    // add extra fields
    payload.extra = [];
    payload.extra.push({ name: 'collectionName', value: collectionName });
    payload.extra.push({ name: 'dayAmount', value: dayAmount?.toString() });
    payload.extra.push({
      name: 'mediaItems',
      value: JSON.stringify(mediaItems),
    });

    // get the rulegroup when available
    let rulegroup = undefined;
    if (identifier) {
      switch (identifier.type) {
        case 'rulegroup':
          rulegroup = await this.ruleGroupRepo.findOne({
            where: {
              id: +identifier.value,
            },
          });
          break;
        case 'collection':
          rulegroup = await this.ruleGroupRepo.findOne({
            where: {
              collectionId: +identifier.value,
            },
          });
          break;
      }
    }

    // notify
    if (agent) {
      return this.sendNotificationToAgent(type, payload, agent);
    } else {
      await this.sendNotification(type, payload, rulegroup);
      return 'Success';
    }
  }

  private getContent(
    type: NotificationType,
    multiple: boolean,
    dayAmount?: number,
  ): { subject: string; message: string } {
    let subject: string;

    let message: string;

    if (!multiple) {
      switch (type) {
        case NotificationType.TEST_NOTIFICATION:
          subject = 'Test Notification';
          message =
            "\uD83D\uDD0D Just checking if this thing works... if you're seeing this, success! If not, well... we have a problem!";
          break;
        case NotificationType.COLLECTION_HANDLING_FAILED:
          subject = 'Collection Handling Failed';
          message =
            '⚠️ Oops! Something went wrong while processing your collections.';
          break;
        case NotificationType.RULE_HANDLING_FAILED:
          subject = 'Rule Handling Failed';
          message =
            '⚠️ Oops! Something went wrong while processing your rules.';
          break;
        case NotificationType.MEDIA_ABOUT_TO_BE_HANDLED:
          subject = 'Media About to be Handled';
          message =
            "⏰ Reminder: '{media_title}' will be handled in {days} days. If you want to keep it, make sure to take action before it's gone. Don’t miss out!";
          break;
        case NotificationType.MEDIA_ADDED_TO_COLLECTION:
          subject = 'Media Added to Collection';
          message = `\uD83D\uDCC2 '{media_title}' has been added to '{collection_name}'.`;
          if (dayAmount != null) {
            message += ' The item will be handled in {days} days.';
          }
          break;
        case NotificationType.MEDIA_REMOVED_FROM_COLLECTION:
          subject = 'Media Removed from Collection';
          message = `\uD83D\uDCC2 '{media_title}' has been removed from '{collection_name}'.`;
          if (dayAmount != null) {
            message += ` It won't be handled anymore.`;
          }
          break;
        case NotificationType.MEDIA_HANDLED:
          subject = 'Media Handled';
          message =
            "✅ '{media_title}' has been handled by '{collection_name}'.";
          break;
      }
    } else {
      switch (type) {
        case NotificationType.MEDIA_ABOUT_TO_BE_HANDLED:
          subject = 'Media About to be Handled';
          message =
            "⏰ Reminder: These media items will be handled in {days} days. If you want to keep them, make sure to take action before they're gone. Don’t miss out! \n \n {media_items}";
          break;
        case NotificationType.MEDIA_ADDED_TO_COLLECTION:
          subject = 'Media Added to Collection';
          message = `\uD83D\uDCC2 These media items have been added to '{collection_name}'.`;
          if (dayAmount != null) {
            message +=
              ' The items will be handled in {days} days. \n \n {media_items}';
          } else {
            message += ' \n \n {media_items}';
          }
          break;
        case NotificationType.MEDIA_REMOVED_FROM_COLLECTION:
          subject = 'Media Removed from Collection';
          message = `\uD83D\uDCC2 These media items have been removed from '{collection_name}'.`;
          if (dayAmount != null) {
            message +=
              ' The items will not be handled anymore. \n \n {media_items}';
          } else {
            message += ' \n \n {media_items}';
          }
          break;
        case NotificationType.MEDIA_HANDLED:
          subject = 'Media Handled';
          message =
            "✅ These media items have been handled by '{collection_name}'. \n \n {media_items}";
          break;
      }
    }

    return {
      subject,
      message,
    };
  }

  private async transformMessageContent(
    message: string,
    items?: { plexId: number }[],
    collectionName?: string,
    dayAmount?: number,
  ): Promise<string> {
    try {
      if (items) {
        if (items.length > 1) {
          // if multiple items
          const titles = [];
          let numUnknownItems = 0;

          for (const i of items) {
            const item = await this.plexApi.getMetadata(i.plexId.toString());

            if (item) {
              titles.push(this.getTitle(item));
            } else {
              numUnknownItems++;
            }
          }

          if (numUnknownItems > 0) {
            titles.push(
              `${numUnknownItems} item${
                numUnknownItems > 1 ? 's' : ''
              } that no longer exist${numUnknownItems > 1 ? '' : 's'} in Plex`,
            );
          }

          const result = titles
            .map((name) => `* ${name.charAt(0).toUpperCase() + name.slice(1)}`)
            .join(' \n');

          message = message.replace('{media_items}', result);
        } else {
          // if 1 item
          const item = await this.plexApi.getMetadata(
            items[0].plexId.toString(),
          );
          message = message.replace(
            '{media_title}',
            item ? this.getTitle(item) : '1 item that no longer exists in Plex',
          );
        }
      }

      message = collectionName
        ? message.replace('{collection_name}', collectionName)
        : message;

      message =
        dayAmount && dayAmount > 0
          ? message.replace('{days}', dayAmount.toString())
          : message;

      return message;
    } catch (e) {
      this.logger.error("Couldn't transform notification message", e);
    }
  }

  private getTitle(item: PlexMetadata): string {
    return item.grandparentRatingKey
      ? `${item.grandparentTitle} - season ${item.parentIndex} - episode ${item.index}`
      : item.parentRatingKey
        ? `${item.parentTitle} - season ${item.index}`
        : item.title;
  }

  // OnEvent handlers

  @OnEvent(MaintainerrEvent.RuleHandler_Failed)
  private async ruleHandlerFailed(data: RuleHandlerFailedDto) {
    await this.handleNotification(
      NotificationType.RULE_HANDLING_FAILED,
      undefined,
      data?.collectionName,
      undefined,
      undefined,
      data?.identifier,
    );
  }

  @OnEvent(MaintainerrEvent.CollectionHandler_Failed)
  private async collectionHandlerFailed() {
    await this.handleNotification(NotificationType.COLLECTION_HANDLING_FAILED);
  }

  @OnEvent(MaintainerrEvent.CollectionMedia_Added)
  private async collectionMediaAdded(data: CollectionMediaAddedDto) {
    await this.handleNotification(
      NotificationType.MEDIA_ADDED_TO_COLLECTION,
      data.mediaItems,
      data.collectionName,
      data.dayAmount,
      undefined,
      data.identifier,
    );
  }

  @OnEvent(MaintainerrEvent.CollectionMedia_Removed)
  private async collectionMediaRemoved(data: CollectionMediaRemovedDto) {
    await this.handleNotification(
      NotificationType.MEDIA_REMOVED_FROM_COLLECTION,
      data.mediaItems,
      data.collectionName,
      data.dayAmount,
      undefined,
      data.identifier,
    );
  }

  @OnEvent(MaintainerrEvent.CollectionMedia_Handled)
  private async collectionMediaHandled(data: CollectionMediaHandledDto) {
    await this.handleNotification(
      NotificationType.MEDIA_HANDLED,
      data.mediaItems,
      data.collectionName,
      undefined,
      undefined,
      data.identifier,
    );
  }
}
