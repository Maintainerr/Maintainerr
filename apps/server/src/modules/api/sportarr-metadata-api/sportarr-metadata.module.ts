import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { SportarrMetadataApiService } from './sportarr-metadata.service';

@Module({
  imports: [ExternalApiModule],
  providers: [SportarrMetadataApiService],
  exports: [SportarrMetadataApiService],
})
export class SportarrMetadataApiModule {}
