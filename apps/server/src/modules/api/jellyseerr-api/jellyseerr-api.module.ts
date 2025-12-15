import { Module } from '@nestjs/common';
import { JellyseerrApiService } from './jellyseerr-api.service';
import { JellyseerrApiController } from './jellyseerr-api.controller';
import { ExternalApiModule } from '../external-api/external-api.module';

@Module({
  imports: [ExternalApiModule],
  providers: [JellyseerrApiService],
  controllers: [JellyseerrApiController],
  exports: [JellyseerrApiService],
})
export class JellyseerrApiModule {}
