import { CanActivate, Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../../../logging/logs.service';
import { SettingsDataService } from '../../../settings/settings-data.service';

/**
 * Guard that checks if a media server (Plex or Jellyfin) is configured.
 * Returns false (denies access with 403 Forbidden) if no media server is set up.
 *
 * Use this guard on endpoints that require a working media server connection.
 * For fresh installations, users must first select and configure their
 * media server before accessing protected endpoints.
 */
@Injectable()
export class MediaServerSetupGuard implements CanActivate {
  constructor(
    private readonly settingsDataService: SettingsDataService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(MediaServerSetupGuard.name);
  }

  async canActivate(): Promise<boolean> {
    try {
      return await this.settingsDataService.testSetup();
    } catch (error) {
      this.logger.error('Media server setup check failed');
      this.logger.debug(error);
      return false;
    }
  }
}
