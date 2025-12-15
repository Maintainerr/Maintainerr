import { Controller, Get } from '@nestjs/common';
import { GitHubApiService } from '../modules/api/github-api/github-api.service';
import { AppService } from './app.service';

@Controller('/api/app')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly githubApi: GitHubApiService,
  ) {}

  @Get('/status')
  async getAppStatus() {
    return JSON.stringify(await this.appService.getAppVersionStatus());
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
