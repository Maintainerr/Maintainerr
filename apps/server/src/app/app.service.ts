import { type VersionResponse } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { GitHubApiService } from '../modules/api/github-api/github-api.service';
import { MaintainerrLogger } from '../modules/logging/logs.service';

const RELEASE_VERSION_TAGS = new Set(['latest', 'stable']);

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
      const gitSha = process.env.GIT_SHA;

      const isReleaseBuild = RELEASE_VERSION_TAGS.has(versionTag);
      const imageTag = gitSha
        ? `${versionTag}-${gitSha.substring(0, 7)}`
        : versionTag;

      const calculatedVersion = isReleaseBuild
        ? `${packageVersion}`
        : gitSha
          ? `${versionTag}-${gitSha.substring(0, 7)}`
          : `${versionTag}-`;

      const local = process.env.NODE_ENV !== 'production';
      const commitTag = local ? 'local' : isReleaseBuild ? imageTag : '';

      return {
        status: 1,
        version: calculatedVersion,
        commitTag,
        updateAvailable: await this.isUpdateAvailable(
          packageVersion,
          versionTag,
        ),
      };
    } catch (error) {
      this.logger.error(`Couldn't fetch app version status`);
      this.logger.debug(error);
      return {
        status: 0,
        version: '0.0.1',
        commitTag: '',
        updateAvailable: false,
      };
    }
  }

  private async isUpdateAvailable(currentVersion: string, versionTag: string) {
    if (RELEASE_VERSION_TAGS.has(versionTag)) {
      const githubResp = await this.githubApi.getLatestRelease(
        'Maintainerr',
        'Maintainerr',
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
      const branch = versionTag === 'main' ? 'main' : 'development';

      // For non-stable builds, compare the current image SHA to the tracked branch head.
      const gitSha = process.env.GIT_SHA;

      if (gitSha) {
        const githubResp = await this.githubApi.getCommit(
          'Maintainerr',
          'Maintainerr',
          branch,
        );
        if (githubResp && githubResp.sha) {
          return githubResp.sha !== gitSha;
        }
      }
    }
    return false;
  }
}
