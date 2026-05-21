import { MediaServerType } from '@maintainerr/contracts';
import {
  forwardRef,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import { Settings } from '../../settings/entities/settings.entities';
import { MediaServerSwitchService } from '../../settings/media-server-switch.service';
import type { MediaServerSwitchService as MediaServerSwitchServiceType } from '../../settings/media-server-switch.service';
import { SettingsService } from '../../settings/settings.service';
import type { SettingsService as SettingsServiceType } from '../../settings/settings.service';
import { EmbyAdapterService } from './emby/emby-adapter.service';
import type { EmbyAdapterService as EmbyAdapterServiceType } from './emby/emby-adapter.service';
import { JellyfinAdapterService } from './jellyfin/jellyfin-adapter.service';
import type { JellyfinAdapterService as JellyfinAdapterServiceType } from './jellyfin/jellyfin-adapter.service';
import { IMediaServerService } from './media-server.interface';
import { PlexAdapterService } from './plex/plex-adapter.service';
import type { PlexAdapterService as PlexAdapterServiceType } from './plex/plex-adapter.service';

/**
 * Type guard to check if settings response is a Settings object
 */
function isSettings(obj: unknown): obj is Settings {
  return obj !== null && typeof obj === 'object' && 'media_server_type' in obj;
}

/**
 * Factory for obtaining the appropriate media server service based on settings.
 *
 * Usage:
 * ```typescript
 * const mediaServer = await this.mediaServerFactory.getService();
 * const libraries = await mediaServer.getLibraries();
 * ```
 */
@Injectable()
export class MediaServerFactory {
  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsServiceType,
    @Inject(forwardRef(() => MediaServerSwitchService))
    private readonly mediaServerSwitchService: MediaServerSwitchServiceType,
    @Inject(forwardRef(() => PlexAdapterService))
    private readonly plexAdapter: PlexAdapterServiceType,
    @Inject(forwardRef(() => JellyfinAdapterService))
    private readonly jellyfinAdapter: JellyfinAdapterServiceType,
    @Inject(forwardRef(() => EmbyAdapterService))
    private readonly embyAdapter: EmbyAdapterServiceType,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(MediaServerFactory.name);
  }

  /**
   * Initialize the configured media server service.
   * Safe to call on startup - handles unconfigured/unavailable servers gracefully.
   */
  async initialize(): Promise<void> {
    try {
      await this.getService();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'No media server type configured') {
        this.logger.log(
          'No media server configured yet - skipping initialization',
        );
      } else {
        // Log the actual error for debugging, but don't crash the app
        this.logger.warn(
          `Media server could not be initialized during startup: ${message}`,
        );
      }
    }
  }

  /**
   * Get the media server service based on current settings.
   * This method reads from settings on each call to support runtime configuration changes.
   */
  async getService(): Promise<IMediaServerService> {
    if (this.mediaServerSwitchService.isSwitching()) {
      throw new ServiceUnavailableException(
        'Media server switch is in progress. Please try again shortly.',
      );
    }

    const serverType = await this.getConfiguredServerType();
    if (!serverType) {
      throw new Error('No media server type configured');
    }

    // Surface the "selected but not yet configured" transition state as a
    // typed, recognizable exception. This window opens between a media-server
    // switch (which nulls the old credentials) and the user saving the new
    // credentials. Callers can treat this as transient rather than a real
    // failure (see NotificationService.transformMessageContent).
    const settings = await this.settingsService.getSettings();
    if (
      isSettings(settings) &&
      !this.areCredentialsPresent(serverType, settings)
    ) {
      throw new ServiceUnavailableException(
        `${serverType} is selected but credentials are not yet configured.`,
      );
    }

    return await this.getServiceByType(serverType);
  }

  private areCredentialsPresent(
    type: MediaServerType,
    settings: Settings,
  ): boolean {
    switch (type) {
      case MediaServerType.JELLYFIN:
        return Boolean(settings.jellyfin_url && settings.jellyfin_api_key);
      case MediaServerType.PLEX:
        return Boolean(
          settings.plex_hostname &&
          settings.plex_name &&
          settings.plex_port &&
          settings.plex_auth_token,
        );
      case MediaServerType.EMBY:
        return Boolean(settings.emby_url && settings.emby_api_key);
      default:
        return false;
    }
  }

  /**
   * Get a specific media server service by type.
   * Useful for testing or when the type is known.
   * Ensures the service is initialized before returning.
   */
  async getServiceByType(
    serverType: MediaServerType,
  ): Promise<IMediaServerService> {
    switch (serverType) {
      case MediaServerType.JELLYFIN:
        return await this.ensureAdapterReady(serverType, this.jellyfinAdapter);

      case MediaServerType.PLEX:
        return await this.ensureAdapterReady(serverType, this.plexAdapter);

      case MediaServerType.EMBY:
        return await this.ensureAdapterReady(serverType, this.embyAdapter);

      default:
        throw new Error(`Unsupported media server type: ${serverType}`);
    }
  }

  /**
   * Get the currently configured media server type.
   */
  async getConfiguredServerType(): Promise<MediaServerType | null> {
    const settings = await this.settingsService.getSettings();

    if (!isSettings(settings)) {
      return null;
    }

    const configuredType = settings.media_server_type as MediaServerType | null;
    const jellyfinConfigured = Boolean(
      settings.jellyfin_url && settings.jellyfin_api_key,
    );
    const plexConfigured = Boolean(
      settings.plex_hostname &&
      settings.plex_name &&
      settings.plex_port &&
      settings.plex_auth_token,
    );
    const embyConfigured = Boolean(settings.emby_url && settings.emby_api_key);
    const inferredType = this.resolveServerType(
      plexConfigured,
      jellyfinConfigured,
      embyConfigured,
    );

    if (!configuredType) {
      return inferredType;
    }

    // Always respect the user's explicitly configured server type.
    // inferredType is only used as a fallback when nothing is configured.
    if (inferredType && configuredType !== inferredType) {
      this.logger.warn(
        `Configured server type '${configuredType}' differs from inferred type '${inferredType}'. Using configured type.`,
      );
    }

    return configuredType;
  }

  /**
   * Uninitialize a specific media server adapter.
   * Used during settings changes and server switching to clear cached state.
   */
  uninitializeServer(serverType: MediaServerType): void {
    switch (serverType) {
      case MediaServerType.PLEX:
        this.plexAdapter.uninitialize();
        break;
      case MediaServerType.JELLYFIN:
        this.jellyfinAdapter.uninitialize();
        break;
      case MediaServerType.EMBY:
        this.embyAdapter.uninitialize();
        break;
      default:
        throw new Error(`Unsupported media server type: ${serverType}`);
    }
  }

  /**
   * Test a Jellyfin connection with the given credentials.
   * Used by settings to validate credentials before saving.
   */
  async testJellyfinConnection(
    url: string,
    apiKey: string,
  ): Promise<{
    success: boolean;
    serverName?: string;
    version?: string;
    error?: string;
    users?: Array<{ id: string; name: string }>;
  }> {
    return this.jellyfinAdapter.testConnection(url, apiKey);
  }

  /**
   * Test an Emby connection with the given credentials (API key flow).
   */
  async testEmbyConnection(
    url: string,
    apiKey: string,
  ): Promise<{
    success: boolean;
    serverName?: string;
    version?: string;
    error?: string;
    users?: Array<{ id: string; name: string }>;
  }> {
    return this.embyAdapter.testConnection(url, apiKey);
  }

  /**
   * Authenticate against an Emby server with admin credentials, mirroring
   * the Plex-flavoured login flow. Returns the resulting access token plus
   * library/user lists for the post-login confirmation step.
   */
  async loginEmbyWithCredentials(
    url: string,
    username: string,
    password: string,
  ) {
    return this.embyAdapter.loginWithCredentials(url, username, password);
  }

  private resolveServerType(
    plexConfigured: boolean,
    jellyfinConfigured: boolean,
    embyConfigured: boolean,
  ): MediaServerType | null {
    if (jellyfinConfigured && !plexConfigured && !embyConfigured) {
      return MediaServerType.JELLYFIN;
    }

    if (plexConfigured && !jellyfinConfigured && !embyConfigured) {
      return MediaServerType.PLEX;
    }

    if (embyConfigured && !plexConfigured && !jellyfinConfigured) {
      return MediaServerType.EMBY;
    }

    // Multiple configured or none configured - can't infer
    return null;
  }

  /**
   * Verify that the configured media server is reachable. If the connection
   * is dead, forces a re-initialization (which for Plex triggers re-discovery
   * from plex.tv). Returns the ready adapter on success.
   *
   * Intended for use as a pre-flight check before jobs that depend on the
   * media server (rule execution, collection handling).
   */
  async verifyConnection(): Promise<IMediaServerService> {
    const adapter = await this.getService();
    const status = await adapter.getStatus();

    if (status) {
      return adapter;
    }

    // Connection is dead — force re-initialization
    this.logger.debug(
      'Media server unreachable during pre-job check, attempting re-initialization',
    );

    const serverType = await this.getConfiguredServerType();
    this.uninitializeServer(serverType);
    const reinitAdapter = await this.getService(); // calls ensureAdapterReady → initialize()

    // Verify the re-initialized adapter is actually reachable
    const retryStatus = await reinitAdapter.getStatus();
    if (!retryStatus) {
      throw new Error('Media server still unreachable after re-initialization');
    }

    return reinitAdapter;
  }

  private async ensureAdapterReady(
    serverType: MediaServerType,
    adapter: IMediaServerService,
  ): Promise<IMediaServerService> {
    if (!adapter.isSetup()) {
      await adapter.initialize();
    }

    if (!adapter.isSetup()) {
      throw new ServiceUnavailableException(
        `${serverType} adapter failed to initialize`,
      );
    }

    return adapter;
  }
}
