import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { ServarrService } from './servarr.service';
import { ServarrApiController } from './servarr-api.controller';

@Module({
  imports: [ExternalApiModule],
  controllers: [ServarrApiController],
  providers: [ServarrService],
  exports: [ServarrService],
})
export class ServarrApiModule {}
