import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KodiAdapterService } from './kodi-adapter.service';
import {
  KodiCollection,
  KodiCollectionMember,
} from './kodi-collection.entities';

@Module({
  imports: [TypeOrmModule.forFeature([KodiCollection, KodiCollectionMember])],
  providers: [KodiAdapterService],
  exports: [KodiAdapterService],
})
export class KodiModule {}
