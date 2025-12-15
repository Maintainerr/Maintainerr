import { Module } from '@nestjs/common';
import { SettingsModule } from '../../../modules/settings/settings.module';
import { PlexSetupGuard } from './guards/plex-setup.guard';
import { PlexApiController } from './plex-api.controller';
import { PlexApiService } from './plex-api.service';

@Module({
  imports: [SettingsModule],
  controllers: [PlexApiController],
  providers: [PlexApiService, PlexSetupGuard],
  exports: [PlexApiService],
})
export class PlexApiModule {}
