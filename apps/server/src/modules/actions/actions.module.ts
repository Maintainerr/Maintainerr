import { Module } from '@nestjs/common';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { MediaIdFinder } from './media-id-finder';
import { RadarrActionHandler } from './radarr-action-handler';
import { SonarrActionHandler } from './sonarr-action-handler';

@Module({
  imports: [MediaServerModule, TmdbApiModule, ServarrApiModule],
  providers: [RadarrActionHandler, SonarrActionHandler, MediaIdFinder],
  exports: [RadarrActionHandler, SonarrActionHandler],
  controllers: [],
})
export class ActionsModule {}
