import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalApiModule } from '../api/internal-api/internal-api.module';
import { JellyseerrApiModule } from '../api/jellyseerr-api/jellyseerr-api.module';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { OverseerrApiModule } from '../api/overseerr-api/overseerr-api.module';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { TautulliApiModule } from '../api/tautulli-api/tautulli-api.module';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionLog } from '../collections/entities/collection_log.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';
import { Rules } from '../rules/entities/rules.entities';
import { DatabaseDownloadService } from './database-download.service';
import { RadarrSettings } from './entities/radarr_settings.entities';
import { Settings } from './entities/settings.entities';
import { SonarrSettings } from './entities/sonarr_settings.entities';
import { MediaServerSwitchService } from './media-server-switch.service';
import { RuleMigrationService } from './rule-migration.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Global()
@Module({
  imports: [
    forwardRef(() => PlexApiModule),
    forwardRef(() => MediaServerModule),
    forwardRef(() => ServarrApiModule),
    forwardRef(() => OverseerrApiModule),
    forwardRef(() => JellyseerrApiModule),
    forwardRef(() => TautulliApiModule),
    forwardRef(() => InternalApiModule),
    TypeOrmModule.forFeature([
      Settings,
      RadarrSettings,
      SonarrSettings,
      Collection,
      CollectionMedia,
      CollectionLog,
      Exclusion,
      RuleGroup,
      Rules,
    ]),
  ],
  providers: [
    SettingsService,
    RuleMigrationService,
    MediaServerSwitchService,
    DatabaseDownloadService,
  ],
  exports: [SettingsService, RuleMigrationService],
  controllers: [SettingsController],
})
export class SettingsModule {}
