export interface DiscordOptions {
  agent: NotificationAgentKey.DISCORD;
  botUsername?: string;
  botAvatarUrl?: string;
  webhookUrl: string;
}

export interface SlackOptions {
  agent: NotificationAgentKey.SLACK;
  webhookUrl: string;
}

export interface EmailOptions {
  agent: NotificationAgentKey.EMAIL;
  senderName: string;
  emailFrom: string;
  emailTo: string;
  smtpHost: string;
  smtpPort: number;
  secure?: boolean;
  ignoreTls?: boolean;
  requireTls?: boolean;
  authUser?: string;
  authPass?: string;
  allowSelfSigned?: boolean;
  pgpKey?: string;
  pgpPassword?: string;
}

export interface LunaSeaOptions {
  agent: NotificationAgentKey.LUNASEA;
  webhookUrl: string;
  profileName?: string;
}

export interface TelegramOptions {
  agent: NotificationAgentKey.TELEGRAM;
  botUsername?: string;
  botAuthToken: string;
  chatId: string;
  sendSilently?: boolean;
}

export interface PushbulletOptions {
  agent: NotificationAgentKey.PUSHBULLET;
  accessToken: string;
  channelTag?: string;
}

export interface PushoverOptions {
  agent: NotificationAgentKey.PUSHOVER;
  accessToken: string;
  userToken: string;
  sound: string;
}

export interface WebhookOptions {
  agent: NotificationAgentKey.WEBHOOK;
  webhookUrl: string;
  jsonPayload: string;
  authHeader?: string;
}

export interface GotifyOptions {
  agent: NotificationAgentKey.GOTIFY;
  url: string;
  token: string;
}

export type NotificationAgentOptions =
  | DiscordOptions
  | SlackOptions
  | EmailOptions
  | LunaSeaOptions
  | TelegramOptions
  | PushbulletOptions
  | PushoverOptions
  | WebhookOptions
  | GotifyOptions;

interface BaseNotificationAgentConfig {
  enabled: boolean;
  types?: number[];
}

export interface NotificationAgentConfig extends BaseNotificationAgentConfig {
  options: NotificationAgentOptions;
}

// Specific agent configurations
export interface NotificationAgentDiscord extends BaseNotificationAgentConfig {
  options: DiscordOptions;
}

export interface NotificationAgentSlack extends BaseNotificationAgentConfig {
  options: SlackOptions;
}

export interface NotificationAgentEmail extends BaseNotificationAgentConfig {
  options: EmailOptions;
}

export interface NotificationAgentLunaSea extends BaseNotificationAgentConfig {
  options: LunaSeaOptions;
}

export interface NotificationAgentTelegram extends BaseNotificationAgentConfig {
  options: TelegramOptions;
}

export interface NotificationAgentPushbullet extends BaseNotificationAgentConfig {
  options: PushbulletOptions;
}

export interface NotificationAgentPushover extends BaseNotificationAgentConfig {
  options: PushoverOptions;
}

export interface NotificationAgentWebhook extends BaseNotificationAgentConfig {
  options: WebhookOptions;
}

export interface NotificationAgentGotify extends BaseNotificationAgentConfig {
  options: GotifyOptions;
}

export type AnyNotificationAgentConfig =
  | NotificationAgentDiscord
  | NotificationAgentSlack
  | NotificationAgentEmail
  | NotificationAgentLunaSea
  | NotificationAgentTelegram
  | NotificationAgentPushbullet
  | NotificationAgentPushover
  | NotificationAgentWebhook
  | NotificationAgentGotify;

export enum NotificationAgentKey {
  DISCORD = 'discord',
  EMAIL = 'email',
  GOTIFY = 'gotify',
  PUSHBULLET = 'pushbullet',
  PUSHOVER = 'pushover',
  SLACK = 'slack',
  TELEGRAM = 'telegram',
  WEBHOOK = 'webhook',
  LUNASEA = 'lunasea',
}

export enum NotificationType {
  MEDIA_ADDED_TO_COLLECTION = 2,
  MEDIA_REMOVED_FROM_COLLECTION = 4,
  MEDIA_ABOUT_TO_BE_HANDLED = 8,
  MEDIA_HANDLED = 16,
  RULE_HANDLING_FAILED = 32,
  COLLECTION_HANDLING_FAILED = 64,
  TEST_NOTIFICATION = 128,
}
