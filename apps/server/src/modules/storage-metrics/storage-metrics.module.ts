import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { RadarrSettings } from '../settings/entities/radarr_settings.entities';
import { SonarrSettings } from '../settings/entities/sonarr_settings.entities';
import { StorageMetricsController } from './storage-metrics.controller';
import { StorageMetricsService } from './storage-metrics.service';

@Module({
  imports: [
    ServarrApiModule,
    MediaServerModule,
    TypeOrmModule.forFeature([
      RadarrSettings,
      SonarrSettings,
      Collection,
      CollectionMedia,
    ]),
  ],
  controllers: [StorageMetricsController],
  providers: [StorageMetricsService],
  exports: [StorageMetricsService],
})
export class StorageMetricsModule {}
