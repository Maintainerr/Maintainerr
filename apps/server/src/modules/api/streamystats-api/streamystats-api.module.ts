import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { StreamystatsApiController } from './streamystats-api.controller';
import { StreamystatsApiService } from './streamystats-api.service';

@Module({
  imports: [ExternalApiModule],
  controllers: [StreamystatsApiController],
  providers: [StreamystatsApiService],
  exports: [StreamystatsApiService],
})
export class StreamystatsApiModule {}
