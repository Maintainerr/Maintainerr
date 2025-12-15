import { Module } from '@nestjs/common';
import { TautulliApiService } from './tautulli-api.service';
import { TautulliApiController } from './tautulli-api.controller';
import { ExternalApiModule } from '../external-api/external-api.module';

@Module({
  imports: [ExternalApiModule],
  controllers: [TautulliApiController],
  providers: [TautulliApiService],
  exports: [TautulliApiService],
})
export class TautulliApiModule {}
