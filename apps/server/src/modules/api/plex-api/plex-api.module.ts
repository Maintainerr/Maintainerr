import { forwardRef, Module } from '@nestjs/common';
import { SettingsModule } from '../../../modules/settings/settings.module';
import { PlexApiService } from './plex-api.service';

/**
 * PlexApiModule
 *
 * Provides the PlexApiService for internal use by other modules.
 * HTTP endpoints are handled by MediaServerController in MediaServerModule.
 */
@Module({
  imports: [forwardRef(() => SettingsModule)],
  providers: [PlexApiService],
  exports: [PlexApiService],
})
export class PlexApiModule {}
