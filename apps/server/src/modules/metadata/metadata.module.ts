import { Module } from '@nestjs/common';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { TvdbApiModule } from '../api/tvdb-api/tvdb.module';
import { MetadataProviders } from './interfaces/metadata-provider.interface';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { TmdbMetadataProvider } from './providers/tmdb-metadata.provider';
import { TvdbMetadataProvider } from './providers/tvdb-metadata.provider';

@Module({
  imports: [TmdbApiModule, TvdbApiModule, MediaServerModule],
  controllers: [MetadataController],
  providers: [
    MetadataService,
    TmdbMetadataProvider,
    TvdbMetadataProvider,
    {
      provide: MetadataProviders,
      useFactory: (
        tmdbProvider: TmdbMetadataProvider,
        tvdbProvider: TvdbMetadataProvider,
      ) => [tmdbProvider, tvdbProvider],
      inject: [TmdbMetadataProvider, TvdbMetadataProvider],
    },
  ],
  exports: [MetadataService],
})
export class MetadataModule {}
