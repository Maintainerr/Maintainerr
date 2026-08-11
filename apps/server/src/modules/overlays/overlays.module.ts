import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { LogsModule } from '../logging/logs.module';
import { TasksModule } from '../tasks/tasks.module';
import { OverlayItemStateEntity } from './entities/overlay-item-state.entities';
import { OverlaySettingsEntity } from './entities/overlay-settings.entities';
import { OverlayTemplateEntity } from './entities/overlay-template.entities';
import { OverlayProcessorService } from './overlay-processor.service';
import { OverlayRenderService } from './overlay-render.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayStateService } from './overlay-state.service';
import { OverlayTaskService } from './overlay-task.service';
import { OverlayTemplateService } from './overlay-template.service';
import { OverlaysController } from './overlays.controller';
import { OverlayProviderModule } from './providers/overlay-provider.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OverlaySettingsEntity,
      OverlayItemStateEntity,
      OverlayTemplateEntity,
      // Read-only, so the module needs no dependency on CollectionsModule.
      Collection,
      CollectionMedia,
    ]),
    // MediaServerModule is imported because the controller uses its
    // MediaServerSetupGuard. OverlayProviderModule handles the rest of the
    // server-specific wiring (Plex/Jellyfin providers + the factory).
    MediaServerModule,
    OverlayProviderModule,
    TasksModule,
    LogsModule,
  ],
  controllers: [OverlaysController],
  providers: [
    OverlaySettingsService,
    OverlayStateService,
    OverlayRenderService,
    OverlayProcessorService,
    OverlayTaskService,
    OverlayTemplateService,
  ],
  exports: [
    OverlaySettingsService,
    OverlayProcessorService,
    OverlayTaskService,
    OverlayTemplateService,
  ],
})
export class OverlaysModule {}
