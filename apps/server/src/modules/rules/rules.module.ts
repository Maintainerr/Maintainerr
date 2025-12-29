import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JellyseerrApiModule } from '../api/jellyseerr-api/jellyseerr-api.module';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { OverseerrApiModule } from '../api/overseerr-api/overseerr-api.module';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { TautulliApiModule } from '../api/tautulli-api/tautulli-api.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { CollectionsModule } from '../collections/collections.module';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { RadarrSettings } from '../settings/entities/radarr_settings.entities';
import { Settings } from '../settings/entities/settings.entities';
import { SonarrSettings } from '../settings/entities/sonarr_settings.entities';
import { TasksModule } from '../tasks/tasks.module';
import { RuleConstanstService } from './constants/constants.service';
import { CommunityRuleKarma } from './entities/community-rule-karma.entities';
import { Exclusion } from './entities/exclusion.entities';
import { RuleGroup } from './entities/rule-group.entities';
import { Rules } from './entities/rules.entities';
import { ValueGetterService } from './getter/getter.service';
import { JellyfinGetterService } from './getter/jellyfin-getter.service';
import { JellyseerrGetterService } from './getter/jellyseerr-getter.service';
import { OverseerrGetterService } from './getter/overseerr-getter.service';
import { PlexGetterService } from './getter/plex-getter.service';
import { RadarrGetterService } from './getter/radarr-getter.service';
import { SonarrGetterService } from './getter/sonarr-getter.service';
import { TautulliGetterService } from './getter/tautulli-getter.service';
import {
  RuleComparatorService,
  RuleComparatorServiceFactory,
} from './helpers/rule.comparator.service';
import { RuleYamlService } from './helpers/yaml.service';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { ExclusionTypeCorrectorService } from './tasks/exclusion-corrector.service';
import { RuleExecutorJobManagerService } from './tasks/rule-executor-job-manager.service';
import { RuleExecutorProgressService } from './tasks/rule-executor-progress.service';
import { RuleExecutorSchedulerService } from './tasks/rule-executor-scheduler.service';
import { RuleExecutorService } from './tasks/rule-executor.service';
import { RuleMaintenanceService } from './tasks/rule-maintenance.service';

@Module({
  imports: [
    PlexApiModule,
    ServarrApiModule,
    MediaServerModule,
    TypeOrmModule.forFeature([
      Rules,
      RuleGroup,
      Collection,
      CollectionMedia,
      Exclusion,
      CommunityRuleKarma,
      Settings,
      RadarrSettings,
      SonarrSettings,
    ]),
    OverseerrApiModule,
    TautulliApiModule,
    JellyseerrApiModule,
    TmdbApiModule,
    forwardRef(() => CollectionsModule),
    TasksModule,
  ],
  providers: [
    RulesService,
    RuleExecutorService,
    RuleExecutorSchedulerService,
    RuleMaintenanceService,
    RuleExecutorProgressService,
    RuleExecutorJobManagerService,
    ExclusionTypeCorrectorService,
    PlexGetterService,
    JellyfinGetterService,
    RadarrGetterService,
    SonarrGetterService,
    OverseerrGetterService,
    TautulliGetterService,
    JellyseerrGetterService,
    ValueGetterService,
    RuleYamlService,
    RuleComparatorService,
    RuleConstanstService,
    RuleComparatorServiceFactory,
  ],
  controllers: [RulesController],
  exports: [RuleExecutorJobManagerService],
})
export class RulesModule {}
