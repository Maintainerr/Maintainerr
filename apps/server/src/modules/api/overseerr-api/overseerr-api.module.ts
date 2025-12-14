import { Module } from '@nestjs/common';
import { OverseerrApiService } from './overseerr-api.service';
import { OverseerrApiController } from './overseerr-api.controller';
import { ExternalApiModule } from '../external-api/external-api.module';

@Module({
  imports: [ExternalApiModule],
  providers: [OverseerrApiService],
  controllers: [OverseerrApiController],
  exports: [OverseerrApiService],
})
export class OverseerrApiModule {}
