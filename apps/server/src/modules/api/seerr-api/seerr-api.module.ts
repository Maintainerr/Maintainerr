import { Module } from '@nestjs/common';
import { SeerrApiService } from './seerr-api.service';
import { SeerrApiController } from './seerr-api.controller';
import { ExternalApiModule } from '../external-api/external-api.module';

@Module({
  imports: [ExternalApiModule],
  providers: [SeerrApiService],
  controllers: [SeerrApiController],
  exports: [SeerrApiService],
})
export class SeerrApiModule {}
