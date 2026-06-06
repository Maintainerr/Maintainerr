import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { DownloadClientApiController } from './download-client-api.controller';
import { DownloadClientApiService } from './download-client-api.service';

@Module({
  imports: [ExternalApiModule],
  controllers: [DownloadClientApiController],
  providers: [DownloadClientApiService],
  exports: [DownloadClientApiService],
})
export class DownloadClientApiModule {}
