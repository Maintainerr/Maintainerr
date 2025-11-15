import { Module } from '@nestjs/common';
import { GitHubApiService } from './github-api.service';

@Module({
  imports: [],
  controllers: [],
  providers: [GitHubApiService],
  exports: [GitHubApiService],
})
export class GitHubApiModule {}
