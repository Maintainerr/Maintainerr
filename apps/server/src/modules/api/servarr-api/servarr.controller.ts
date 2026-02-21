import { Controller, Get, Param, ParseIntPipe, Logger } from '@nestjs/common';
import { ServarrService } from './servarr.service';

interface QualityProfile {
  id: number;
  name: string;
}

@Controller('/api/servarr')
export class ServarrController {
  private readonly logger = new Logger(ServarrController.name);

  constructor(private readonly servarrService: ServarrService) {}

  private validateProfiles(profiles: unknown): QualityProfile[] {
    if (!Array.isArray(profiles)) {
      return [];
    }
    return profiles.filter(
      (p): p is QualityProfile =>
        p != null &&
        typeof p === 'object' &&
        'id' in p &&
        'name' in p &&
        typeof p.id === 'number' &&
        typeof p.name === 'string',
    );
  }

  @Get('/radarr/:id/profiles')
  async getRadarrProfiles(@Param('id', ParseIntPipe) id: number) {
    try {
      const radarrApiClient = await this.servarrService.getRadarrApiClient(id);
      const profiles = await radarrApiClient.getProfiles();
      const validatedProfiles = this.validateProfiles(profiles);

      if (
        profiles &&
        !validatedProfiles.length &&
        Array.isArray(profiles) &&
        profiles.length > 0
      ) {
        this.logger.warn(
          `Invalid quality profiles response from Radarr settings ${id}`,
        );
      }

      return validatedProfiles;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Radarr profiles for settings ${id}: ${error.message}`,
      );
      return [];
    }
  }

  @Get('/sonarr/:id/profiles')
  async getSonarrProfiles(@Param('id', ParseIntPipe) id: number) {
    try {
      const sonarrApiClient = await this.servarrService.getSonarrApiClient(id);
      const profiles = await sonarrApiClient.getProfiles();
      const validatedProfiles = this.validateProfiles(profiles);

      if (
        profiles &&
        !validatedProfiles.length &&
        Array.isArray(profiles) &&
        profiles.length > 0
      ) {
        this.logger.warn(
          `Invalid quality profiles response from Sonarr settings ${id}`,
        );
      }

      return validatedProfiles;
    } catch (error) {
      this.logger.error(
        `Failed to fetch Sonarr profiles for settings ${id}: ${error.message}`,
      );
      return [];
    }
  }
}
