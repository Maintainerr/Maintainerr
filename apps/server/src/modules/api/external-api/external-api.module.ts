import { Module } from '@nestjs/common';
import { ExternalApiService } from './external-api.service';

@Module({
  imports: [],
  controllers: [],
  providers: [ExternalApiService],
  exports: [ExternalApiService],
})
export class ExternalApiModule {}
