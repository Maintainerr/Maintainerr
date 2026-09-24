import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { OmbiApiController } from './ombi-api.controller';
import { OmbiApiService } from './ombi-api.service';

@Module({
  imports: [ExternalApiModule],
  controllers: [OmbiApiController],
  providers: [OmbiApiService],
  exports: [OmbiApiService],
})
export class OmbiApiModule {}
