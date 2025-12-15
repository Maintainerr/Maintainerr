import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { InternalApiService } from './internal-api.service';
import { InternalApiController } from './internal-api.controller';

@Module({
  imports: [ExternalApiModule],
  providers: [InternalApiService],
  controllers: [InternalApiController],
  exports: [InternalApiService],
})
export class InternalApiModule {}
