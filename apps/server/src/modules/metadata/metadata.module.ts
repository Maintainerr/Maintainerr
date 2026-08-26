import { Module } from '@nestjs/common';
import { MediaServerModule } from '../api/media-server/media-server.module';
import { SportarrMetadataApiModule } from '../api/sportarr-metadata-api/sportarr-metadata.module';
import { TmdbApiModule } from '../api/tmdb-api/tmdb.module';
import { TvdbApiModule } from '../api/tvdb-api/tvdb.module';
import { MetadataProviders } from './interfaces/metadata-provider.interface';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { SportarrMetadataProvider } from './providers/sportarr-metadata.provider';
import { TmdbMetadataProvider } from './providers/tmdb-metadata.provider';
import { TvdbMetadataProvider } from './providers/tvdb-metadata.provider';

@Module({
  imports: [
    MediaServerModule,
    SportarrMetadataApiModule,
    TmdbApiModule,
    TvdbApiModule,
  ],
  controllers: [MetadataController],
  providers: [
    MetadataService,
    SportarrMetadataProvider,
    TmdbMetadataProvider,
    TvdbMetadataProvider,
    {
      provide: MetadataProviders,
      useFactory: (
        tmdbProvider: TmdbMetadataProvider,
        tvdbProvider: TvdbMetadataProvider,
        sportarrProvider: SportarrMetadataProvider,
      ) => [tmdbProvider, tvdbProvider, sportarrProvider],
      inject: [
        TmdbMetadataProvider,
        TvdbMetadataProvider,
        SportarrMetadataProvider,
      ],
    },
  ],
  exports: [MetadataService],
})
export class MetadataModule {}
