import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { MediaServerModule } from '../media-server/media-server.module';
import { TracearrApiService } from './tracearr-api.service';

@Module({
  imports: [ExternalApiModule, MediaServerModule],
  providers: [TracearrApiService],
  exports: [TracearrApiService],
})
export class TracearrApiModule {}
