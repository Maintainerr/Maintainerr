import { Module } from '@nestjs/common';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { SeerrApiModule } from '../api/seerr-api/seerr-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { MetadataModule } from '../metadata/metadata.module';
import { RadarrActionHandler } from './radarr-action-handler';
import { SonarrActionHandler } from './sonarr-action-handler';

@Module({
  imports: [
    MediaServerModule,
    ServarrApiModule,
    SeerrApiModule,
    MetadataModule,
  ],
  providers: [RadarrActionHandler, SonarrActionHandler],
  exports: [RadarrActionHandler, SonarrActionHandler],
  controllers: [],
})
export class ActionsModule {}
