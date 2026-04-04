import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { CollectionsModule } from '../collections/collections.module';
import { LogsModule } from '../logging/logs.module';
import { TasksModule } from '../tasks/tasks.module';
import { OverlayItemStateEntity } from './entities/overlay-item-state.entities';
import { OverlaySettingsEntity } from './entities/overlay-settings.entities';
import { OverlayProcessorService } from './overlay-processor.service';
import { OverlayRenderService } from './overlay-render.service';
import { OverlaySettingsService } from './overlay-settings.service';
import { OverlayStateService } from './overlay-state.service';
import { OverlayTaskService } from './overlay-task.service';
import { OverlaysController } from './overlays.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OverlaySettingsEntity, OverlayItemStateEntity]),
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
  ],
  exports: [
    OverlaySettingsService,
    OverlayProcessorService,
    OverlayTaskService,
  ],
})
export class OverlaysModule {}
