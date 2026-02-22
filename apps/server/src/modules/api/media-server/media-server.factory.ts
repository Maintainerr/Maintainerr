import { MediaServerType } from '@maintainerr/contracts';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Settings } from '../../settings/entities/settings.entities';
import { MediaServerSwitchService } from '../../settings/media-server-switch.service';
import { SettingsService } from '../../settings/settings.service';
import { JellyfinAdapterService } from './jellyfin/jellyfin-adapter.service';
import { IMediaServerService } from './media-server.interface';
import { PlexAdapterService } from './plex/plex-adapter.service';

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
  private readonly logger = new Logger(MediaServerFactory.name);

  constructor(
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
    @Inject(forwardRef(() => MediaServerSwitchService))
    private readonly mediaServerSwitchService: MediaServerSwitchService,
    private readonly plexAdapter: PlexAdapterService,
    private readonly jellyfinAdapter: JellyfinAdapterService,
  ) {}

  /**
   * Initialize the configured media server service.
   * Safe to call on startup - handles unconfigured/unavailable servers gracefully.
   */
  async initialize(): Promise<void> {
    try {
      await this.getService();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
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

    return await this.getServiceByType(serverType);
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
        if (!this.jellyfinAdapter.isSetup()) {
          await this.jellyfinAdapter.initialize();
        }
        return this.jellyfinAdapter;

      case MediaServerType.PLEX:
        if (!this.plexAdapter.isSetup()) {
          await this.plexAdapter.initialize();
        }
        return this.plexAdapter;

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
    const inferredType = this.resolveServerType(
      plexConfigured,
      jellyfinConfigured,
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

  private resolveServerType(
    plexConfigured: boolean,
    jellyfinConfigured: boolean,
  ): MediaServerType | null {
    if (jellyfinConfigured && !plexConfigured) {
      return MediaServerType.JELLYFIN;
    }

    if (plexConfigured && !jellyfinConfigured) {
      return MediaServerType.PLEX;
    }

    // Both configured or neither configured - can't infer
    return null;
  }
}
