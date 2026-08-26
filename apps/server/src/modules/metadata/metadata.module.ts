import { Module } from '@nestjs/common';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { SportarrHubApiModule } from '../api/sportarr-hub-api/sportarr-hub.module';
import { TvdbApiModule } from '../api/tvdb-api/tvdb.module';
import { MetadataProviders } from './interfaces/metadata-provider.interface';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { TmdbMetadataProvider } from './providers/tmdb-metadata.provider';
import { SportarrMetadataProvider } from './providers/sportarr-metadata.provider';
import { TvdbMetadataProvider } from './providers/tvdb-metadata.provider';

@Module({
  imports: [
    TmdbApiModule,
    TvdbApiModule,
    SportarrHubApiModule,
    MediaServerModule,
  ],
  controllers: [MetadataController],
  providers: [
    MetadataService,
    TmdbMetadataProvider,
    TvdbMetadataProvider,
    SportarrMetadataProvider,
    {
      provide: MetadataProviders,
      useFactory: (
        tmdbProvider: TmdbMetadataProvider,
        sportarrProvider: SportarrMetadataProvider,
        tvdbProvider: TvdbMetadataProvider,
      ) => [tmdbProvider, sportarrProvider, tvdbProvider],
      inject: [
        TmdbMetadataProvider,
        SportarrMetadataProvider,
        TvdbMetadataProvider,
      ],
    },
  ],
  exports: [MetadataService],
})
export class MetadataModule {}
