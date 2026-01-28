import { MediaServerType } from '@maintainerr/contracts';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Settings } from '../../settings/entities/settings.entities';
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
    } catch {
      // Media server not configured yet, that's OK for fresh installs
    }
  }

  /**
   * Get the media server service based on current settings.
   * This method reads from settings on each call to support runtime configuration changes.
   */
  async getService(): Promise<IMediaServerService> {
    const settings = await this.settingsService.getSettings();

    if (!isSettings(settings)) {
      return this.plexAdapter;
    }

    const serverType =
      (settings.media_server_type as MediaServerType) || MediaServerType.PLEX;

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
      default:
        if (!this.plexAdapter.isSetup()) {
          await this.plexAdapter.initialize();
        }
        return this.plexAdapter;
    }
  }

  /**
   * Get the currently configured media server type.
   */
  async getConfiguredServerType(): Promise<MediaServerType> {
    const settings = await this.settingsService.getSettings();

    if (!isSettings(settings)) {
      return MediaServerType.PLEX;
    }

    return (
      (settings.media_server_type as MediaServerType) || MediaServerType.PLEX
    );
  }
}
