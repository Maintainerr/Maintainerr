import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionsModule } from '../actions/actions.module';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { SeerrApiModule } from '../api/seerr-api/seerr-api.module';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { TautulliApiModule } from '../api/tautulli-api/tautulli-api.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { CollectionLog } from '../collections/entities/collection_log.entities';
import { CollectionLogCleanerService } from '../collections/tasks/collection-log-cleaner.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { RulesModule } from '../rules/rules.module';
import { SettingsModule } from '../settings/settings.module';
import { TasksModule } from '../tasks/tasks.module';
import { CollectionHandler } from './collection-handler';
import { CollectionWorkerService } from './collection-worker.service';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { Collection } from './entities/collection.entities';
import { CollectionMedia } from './entities/collection_media.entities';

@Module({
  imports: [
    PlexApiModule,
    MediaServerModule,
    SettingsModule,
    TypeOrmModule.forFeature([
      Collection,
      CollectionMedia,
      CollectionLog,
      RuleGroup,
      Exclusion,
    ]),
    SeerrApiModule,
    TautulliApiModule,
    TmdbApiModule,
    ServarrApiModule,
    TasksModule,
    ActionsModule,
    forwardRef(() => RulesModule),
  ],
  providers: [
    CollectionsService,
    CollectionWorkerService,
    CollectionLogCleanerService,
    CollectionHandler,
  ],
  controllers: [CollectionsController],
  exports: [CollectionsService],
})
export class CollectionsModule {}
