import { Module } from '@nestjs/common';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { TvdbApiModule } from '../api/tvdb-api/tvdb.module';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';

@Module({
  imports: [TmdbApiModule, TvdbApiModule, MediaServerModule],
  controllers: [MetadataController],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}
