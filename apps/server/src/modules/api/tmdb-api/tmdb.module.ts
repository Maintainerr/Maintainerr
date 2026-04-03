import { Module, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../../settings/settings.module';
import { ExternalApiModule } from '../external-api/external-api.module';
import { TmdbApiService } from './tmdb.service';

@Module({
  imports: [ExternalApiModule, forwardRef(() => SettingsModule)],
  providers: [TmdbApiService],
  exports: [TmdbApiService],
})
export class TmdbApiModule {}
