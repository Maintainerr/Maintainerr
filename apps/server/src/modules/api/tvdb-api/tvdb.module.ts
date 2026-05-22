import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { TvdbApiService } from './tvdb.service';

@Module({
  imports: [ExternalApiModule],
  providers: [TvdbApiService],
  exports: [TvdbApiService],
})
export class TvdbApiModule {}
