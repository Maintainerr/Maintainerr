import { type VersionResponse } from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { GitHubApiService } from '../api/github-api/github-api.service';
import { MaintainerrLogger } from '../logging/logs.service';

export const RELEASE_VERSION_TAGS = new Set(['latest', 'stable']);

export interface AvailableUpdate {
  /** Version label of the newer build, e.g. `3.21.1` or `main-bd8a1e0`. */
  version: string;
  /** Release page, when the newer build is a published release. */
  releaseUrl?: string;
}

@Injectable()
export class VersionService {
  constructor(
    private readonly githubApi: GitHubApiService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(VersionService.name);
  }

  async getAppVersionStatus(): Promise<VersionResponse> {
    try {
      const { versionTag, gitSha } = this.getBuildInfo();

      const isReleaseBuild = RELEASE_VERSION_TAGS.has(versionTag);
      const imageTag = gitSha
        ? `${versionTag}-${gitSha.substring(0, 7)}`
        : versionTag;

      const local = process.env.NODE_ENV !== 'production';
      const commitTag = local ? 'local' : isReleaseBuild ? imageTag : '';

      return {
        status: 1,
        version: this.getCurrentVersion(),
        commitTag,
        updateAvailable: (await this.getAvailableUpdate()) !== undefined,
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

  /** The stream this build tracks: `latest`, `stable`, `main` or `development`. */
  getVersionTag(): string {
    return this.getBuildInfo().versionTag;
  }

  /**
   * The running build's version label: `3.18.0` for a release, otherwise the
   * stream plus its image SHA (`development-bd8a1e0`).
   */
  getCurrentVersion(): string {
    const { packageVersion, versionTag, gitSha } = this.getBuildInfo();

    if (RELEASE_VERSION_TAGS.has(versionTag)) {
      return packageVersion;
    }

    return gitSha
      ? `${versionTag}-${gitSha.substring(0, 7)}`
      : `${versionTag}-`;
  }

  /**
   * The newer build available upstream, or undefined when this build is up to
   * date or the check couldn't be completed. Release builds compare against the
   * latest GitHub release; every other stream compares its image SHA against
   * the head of the branch it tracks.
   */
  async getAvailableUpdate(): Promise<AvailableUpdate | undefined> {
    const { packageVersion, versionTag, gitSha } = this.getBuildInfo();

    if (RELEASE_VERSION_TAGS.has(versionTag)) {
      const release = await this.githubApi.getLatestRelease(
        'Maintainerr',
        'Maintainerr',
      );

      if (!release?.tag_name) {
        this.logger.warn(`Couldn't fetch latest release version from GitHub`);
        return undefined;
      }

      return this.isRemoteVersionNewer(packageVersion, release.tag_name)
        ? {
            version: this.stripVersionPrefix(release.tag_name),
            releaseUrl: release.html_url,
          }
        : undefined;
    }

    if (!gitSha) {
      return undefined;
    }

    const branch = versionTag === 'main' ? 'main' : 'development';
    const commit = await this.githubApi.getCommit(
      'Maintainerr',
      'Maintainerr',
      branch,
    );

    if (!commit?.sha || commit.sha === gitSha) {
      return undefined;
    }

    // A branch build has no release page to link to.
    return { version: `${versionTag}-${commit.sha.substring(0, 7)}` };
  }

  private getBuildInfo(): {
    packageVersion: string;
    versionTag: string;
    gitSha: string | undefined;
  } {
    return {
      packageVersion: process.env.npm_package_version || '0.0.1',
      versionTag: process.env.VERSION_TAG || 'develop',
      gitSha: process.env.GIT_SHA,
    };
  }

  private isRemoteVersionNewer(local: string, remote: string): boolean {
    const localParts = this.parseSemver(local);
    const remoteParts = this.parseSemver(remote);

    for (let i = 0; i < 3; i++) {
      if (remoteParts[i] > localParts[i]) return true;
      if (remoteParts[i] < localParts[i]) return false;
    }
    return false;
  }

  private parseSemver(version: string): [number, number, number] {
    const core = this.stripVersionPrefix(version).split('-')[0];
    const segments = core.split('.').map((s) => Number.parseInt(s, 10));
    return [
      Number.isFinite(segments[0]) ? segments[0] : 0,
      Number.isFinite(segments[1]) ? segments[1] : 0,
      Number.isFinite(segments[2]) ? segments[2] : 0,
    ];
  }

  private stripVersionPrefix(version: string): string {
    return version.startsWith('v') ? version.slice(1) : version;
  }
}
