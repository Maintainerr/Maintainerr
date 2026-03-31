import { Module, forwardRef } from '@nestjs/common';
import { SettingsModule } from '../../settings/settings.module';
import { ExternalApiModule } from '../external-api/external-api.module';
import { TvdbApiService } from './tvdb.service';

@Module({
  imports: [ExternalApiModule, forwardRef(() => SettingsModule)],
  providers: [TvdbApiService],
  exports: [TvdbApiService],
})
export class TvdbApiModule {}
