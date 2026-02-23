import { Module } from '@nestjs/common';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { MetadataModule } from '../metadata/metadata.module';
import { MediaIdFinder } from './media-id-finder';
import { RadarrActionHandler } from './radarr-action-handler';
import { SonarrActionHandler } from './sonarr-action-handler';

@Module({
  imports: [MediaServerModule, MetadataModule, ServarrApiModule],
  providers: [RadarrActionHandler, SonarrActionHandler, MediaIdFinder],
  exports: [RadarrActionHandler, SonarrActionHandler],
  controllers: [],
})
export class ActionsModule {}
