import { BadRequestException, CanActivate, Injectable } from '@nestjs/common';
import { PlexApiService } from '../plex-api.service';

@Injectable()
export class PlexSetupGuard implements CanActivate {
  constructor(private readonly plexApiService: PlexApiService) {}

  canActivate(): boolean {
    if (this.plexApiService.isPlexSetup()) {
      return true;
    }

    throw new BadRequestException(
      'Plex is not configured yet. Please finish the Plex setup before using this endpoint.',
    );
  }
}
