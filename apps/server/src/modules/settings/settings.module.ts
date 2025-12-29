import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settings } from './entities/settings.entities';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { PlexApiModule } from '../api/plex-api/plex-api.module';
import { ServarrApiModule } from '../api/servarr-api/servarr-api.module';
import { OverseerrApiModule } from '../api/overseerr-api/overseerr-api.module';
import { InternalApiModule } from '../api/internal-api/internal-api.module';
import { TautulliApiModule } from '../api/tautulli-api/tautulli-api.module';
import { RadarrSettings } from './entities/radarr_settings.entities';
import { SonarrSettings } from './entities/sonarr_settings.entities';
import { JellyseerrApiModule } from '../api/jellyseerr-api/jellyseerr-api.module';
import { Collection } from '../collections/entities/collection.entities';
import { CollectionMedia } from '../collections/entities/collection_media.entities';
import { CollectionLog } from '../collections/entities/collection_log.entities';
import { Exclusion } from '../rules/entities/exclusion.entities';
import { RuleGroup } from '../rules/entities/rule-group.entities';

@Global()
@Module({
  imports: [
    forwardRef(() => PlexApiModule),
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
    ]),
  ],
  providers: [SettingsService],
  exports: [SettingsService],
  controllers: [SettingsController],
})
export class SettingsModule {}
