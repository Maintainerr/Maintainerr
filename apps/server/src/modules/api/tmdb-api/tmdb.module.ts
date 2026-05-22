import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { TmdbApiService } from './tmdb.service';

@Module({
  imports: [ExternalApiModule],
  providers: [TmdbApiService],
  exports: [TmdbApiService],
})
export class TmdbApiModule {}
