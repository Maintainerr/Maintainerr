import { Module } from '@nestjs/common';
import { GitHubApiModule } from '../api/github-api/github-api.module';
import { VersionService } from './version.service';

@Module({
  imports: [GitHubApiModule],
  providers: [VersionService],
  exports: [VersionService],
})
export class VersionModule {}
