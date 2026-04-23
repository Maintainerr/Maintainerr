import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { CollectionsModule } from '../collections/collections.module';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OverlaySettingsEntity,
      OverlayItemStateEntity,
      OverlayTemplateEntity,
    ]),
    MediaServerModule,
    PlexApiModule,
    CollectionsModule,
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
