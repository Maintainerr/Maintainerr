import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { SportarrHubApiService } from './sportarr-hub.service';

@Module({
  imports: [ExternalApiModule],
  providers: [SportarrHubApiService],
  exports: [SportarrHubApiService],
})
export class SportarrHubApiModule {}
