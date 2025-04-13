import { type VersionResponse } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalApiService } from '../modules/api/external-api/external-api.service';
import { MaintainerrLogger } from '../modules/logging/logs.service';

@Injectable()
export class AppService {
  constructor(
    private readonly externalApi: ExternalApiService,
    private readonly logger: MaintainerrLogger,
    private readonly configService: ConfigService,
  ) {
    logger.setContext(AppService.name);
  }

  async getAppVersionStatus(): Promise<VersionResponse> {
    try {
      const packageVersion = process.env.npm_package_version
        ? process.env.npm_package_version
        : '0.0.1';

      const versionTag = this.configService.get<string>('VERSION_TAG');
      const gitSha = this.configService.get<string>('GIT_SHA');

      const calculatedVersion =
        versionTag !== 'stable'
          ? gitSha
            ? `${versionTag}-${gitSha.substring(0, 7)}`
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
      const githubResp: { tag_name: string } = await this.externalApi.get(
        'https://api.github.com/repos/jorenn92/maintainerr/releases/latest',
        {},
        7200, // cache this for 2 hours
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
      const gitSha = this.configService.get<string>('GIT_SHA');

      // in case of develop, compare SHA's
      if (gitSha) {
        const githubResp: { sha: string } = await this.externalApi.get(
          'https://api.github.com/repos/jorenn92/maintainerr/commits/main',
          {},
          7200, // cache this for 2 hours
        );
        if (githubResp?.sha) {
          return githubResp.sha !== gitSha;
        }
      }
    }
    return false;
  }
}
