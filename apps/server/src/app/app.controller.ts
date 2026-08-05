import { Controller, Get } from '@nestjs/common';
import { GitHubApiService } from '../modules/api/github-api/github-api.service';
import { VersionService } from '../modules/version/version.service';

@Controller('/api/app')
export class AppController {
  constructor(
    private readonly versionService: VersionService,
    private readonly githubApi: GitHubApiService,
  ) {}

  @Get('/status')
  async getAppStatus() {
    return JSON.stringify(await this.versionService.getAppVersionStatus());
  }

  @Get('/timezone')
  async getAppTimezone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  @Get('/releases')
  async getGitHubReleases() {
    const releases = await this.githubApi.getReleases(
      'maintainerr',
      'maintainerr',
      10,
    );
    return releases || [];
  }
}
