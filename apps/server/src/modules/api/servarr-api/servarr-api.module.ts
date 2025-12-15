import { Module } from '@nestjs/common';
import { ExternalApiModule } from '../external-api/external-api.module';
import { ServarrService } from './servarr.service';

@Module({
  imports: [ExternalApiModule],
  controllers: [],
  providers: [ServarrService],
  exports: [ServarrService],
})
export class ServarrApiModule {}
