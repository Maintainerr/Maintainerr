import { forwardRef, Module } from '@nestjs/common';
import { SettingsModule } from '../../../settings/settings.module';
import { EmbyAdapterService } from './emby-adapter.service';

@Module({
  imports: [forwardRef(() => SettingsModule)],
  providers: [EmbyAdapterService],
  exports: [EmbyAdapterService],
})
export class EmbyModule {}
