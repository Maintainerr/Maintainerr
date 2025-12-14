import { Module } from '@nestjs/common';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { MediaIdFinder } from './media-id-finder';
import { RadarrActionHandler } from './radarr-action-handler';
import { SonarrActionHandler } from './sonarr-action-handler';

@Module({
  imports: [PlexApiModule, TmdbApiModule, ServarrApiModule],
  providers: [RadarrActionHandler, SonarrActionHandler, MediaIdFinder],
  exports: [RadarrActionHandler, SonarrActionHandler],
  controllers: [],
})
export class ActionsModule {}
