import { forwardRef, Module } from '@nestjs/common';
import { SettingsModule } from '../../../modules/settings/settings.module';
import { PlexApiService } from './plex-api.service';

/**
 * PlexApiModule
 *
 * Provides the PlexApiService for internal use by other modules.
 */
@Module({
  imports: [forwardRef(() => SettingsModule)],
  controllers: [],
  providers: [PlexApiService],
  exports: [PlexApiService],
})
export class PlexApiModule {}
