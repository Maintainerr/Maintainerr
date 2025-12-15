import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { PlexApiModule } from '../plex-api/plex-api.module';
import { TmdbIdService } from './tmdb-id.service';
import { TmdbApiController } from './tmdb.controller';
import { TmdbApiService } from './tmdb.service';

@Module({
  imports: [ExternalApiModule, PlexApiModule],
  controllers: [TmdbApiController],
  providers: [TmdbApiService, TmdbIdService],
  exports: [TmdbApiService, TmdbIdService],
})
export class TmdbApiModule {}
