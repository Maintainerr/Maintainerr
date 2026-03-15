import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { ServarrController } from './servarr.controller';
import { ServarrService } from './servarr.service';
import { ServarrApiController } from './servarr-api.controller';

@Module({
  imports: [ExternalApiModule],
  controllers: [ServarrApiController, ServarrController],
  providers: [ServarrService],
  exports: [ServarrService],
})
export class ServarrApiModule {}
