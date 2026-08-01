import { Module } from '@nestjs/common';
import { DownloadClientApiModule } from '../api/download-client-api/download-client-api.module';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { SeerrApiModule } from '../api/seerr-api/seerr-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { MetadataModule } from '../metadata/metadata.module';
import { LeftoverFolderCleanupService } from './leftover-folder-cleanup.service';
import { RadarrActionHandler } from './radarr-action-handler';
import { ServarrTagService } from './servarr-tag.service';
import { SonarrActionHandler } from './sonarr-action-handler';
import { SportarrActionHandler } from './sportarr-action-handler';

@Module({
  imports: [
    MediaServerModule,
    ServarrApiModule,
    SeerrApiModule,
    DownloadClientApiModule,
    MetadataModule,
  ],
  providers: [
    RadarrActionHandler,
    SonarrActionHandler,
    SportarrActionHandler,
    ServarrTagService,
    LeftoverFolderCleanupService,
  ],
  exports: [
    RadarrActionHandler,
    SonarrActionHandler,
    SportarrActionHandler,
    ServarrTagService,
  ],
  controllers: [],
})
export class ActionsModule {}
