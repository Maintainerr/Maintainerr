import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionsModule } from '../actions/actions.module';
import { JellyseerrApiModule } from '../api/jellyseerr-api/jellyseerr-api.module';
import { OverseerrApiModule } from '../api/overseerr-api/overseerr-api.module';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { TautulliApiModule } from '../api/tautulli-api/tautulli-api.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { CollectionLog } from '../collections/entities/collection_log.entities';
import { CollectionLogCleanerService } from '../collections/tasks/collection-log-cleaner.service';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { RulesModule } from '../rules/rules.module';
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
    TypeOrmModule.forFeature([
      Collection,
      CollectionMedia,
      CollectionLog,
      RuleGroup,
      Exclusion,
    ]),
    OverseerrApiModule,
    TautulliApiModule,
    JellyseerrApiModule,
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
