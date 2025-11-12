import { type VersionResponse } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { GitHubApiService } from '../modules/api/github-api/github-api.service';
import { MaintainerrLogger } from '../modules/logging/logs.service';

@Injectable()
export class AppService {
  constructor(
    private readonly githubApi: GitHubApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(AppService.name);
  }

  async getAppVersionStatus(): Promise<VersionResponse> {
    try {
      const packageVersion = process.env.npm_package_version
        ? process.env.npm_package_version
        : '0.0.1';

      const versionTag = process.env.VERSION_TAG
        ? process.env.VERSION_TAG
        : 'develop';

      const calculatedVersion =
        versionTag !== 'stable'
          ? process.env.GIT_SHA
            ? `${versionTag}-${process.env.GIT_SHA.substring(0, 7)}`
            : `${versionTag}-`
          : `${packageVersion}`;

      const local = process.env.NODE_ENV !== 'production';

      return {
        status: 1,
        version: calculatedVersion,
        commitTag: `${local ? 'local' : ''}`,
        updateAvailable: await this.isUpdateAvailable(
          packageVersion,
          versionTag,
        ),
      };
    } catch (err) {
      this.logger.error(`Couldn't fetch app version status`);
      this.logger.debug(err);
      return {
        status: 0,
        version: '0.0.1',
        commitTag: '',
        updateAvailable: false,
      };
    }
  }

  private async isUpdateAvailable(currentVersion: string, versionTag: string) {
    if (versionTag === 'stable') {
      const githubResp = await this.githubApi.getLatestRelease(
        'jorenn92',
        'maintainerr',
      );
      if (githubResp && githubResp.tag_name) {
        const transformedLocalVersion = currentVersion
          .replace('v', '')
          .replace('.', '');

        const transformedGithubVersion = githubResp.tag_name
          .replace('v', '')
          .replace('.', '');

        return transformedGithubVersion > transformedLocalVersion;
      }
      this.logger.warn(`Couldn't fetch latest release version from GitHub`);
      return false;
    } else {
      // in case of develop, compare SHA's
      if (process.env.GIT_SHA) {
        const githubResp = await this.githubApi.getCommit(
          'jorenn92',
          'maintainerr',
          'main',
        );
        if (githubResp && githubResp.sha) {
          return githubResp.sha !== process.env.GIT_SHA;
        }
      }
    }
    return false;
  }
}
