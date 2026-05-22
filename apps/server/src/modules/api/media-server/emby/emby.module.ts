import { Module } from '@nestjs/common';
import { EmbyAdapterService } from './emby-adapter.service';

@Module({
  providers: [EmbyAdapterService],
  exports: [EmbyAdapterService],
})
export class EmbyModule {}
