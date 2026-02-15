import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { ServarrController } from './servarr.controller';
import { ServarrService } from './servarr.service';

@Module({
  imports: [ExternalApiModule],
  controllers: [ServarrController],
  providers: [ServarrService],
  exports: [ServarrService],
})
export class ServarrApiModule {}
