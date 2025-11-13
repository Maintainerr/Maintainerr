import { Injectable } from '@nestjs/common';
import { MaintainerrLogger } from '../../logging/logs.service';
import cacheManager from '../lib/cache';

// Type imports for Octokit (doesn't affect runtime)
import type { Octokit } from 'octokit';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  created_at: string;
  published_at: string;
}

export interface GitHubCommit {
  sha: string;
}

@Injectable()
export class GitHubApiService {
  private octokitPromise: Promise<Octokit>;
  private cache = cacheManager.getCache('github');

  constructor(private readonly logger: MaintainerrLogger) {
    logger.setContext(GitHubApiService.name);

    // Initialize Octokit with throttling plugin using dynamic import
    this.octokitPromise = this.initializeOctokit();
  }

  private async initializeOctokit(): Promise<Octokit> {
    // Use dynamic import for ES modules
    const { Octokit } = await import('octokit');
    const { throttling } = await import('@octokit/plugin-throttling');

    // Create Octokit instance with throttling plugin
    const OctokitWithPlugins = Octokit.plugin(throttling);

    const octokitOptions: ConstructorParameters<typeof OctokitWithPlugins>[0] =
      {
        throttle: {
          onRateLimit: (retryAfter, options, octokit, retryCount) => {
            this.logger.warn(
              `Request quota exhausted for ${options.method} ${options.url}`,
            );

            if (retryAfter && retryAfter > 10) {
              this.logger.error(
                `Aborting retry for ${options.method} ${options.url} due to long wait time of ${retryAfter} seconds`,
              );
              return false;
            }

            // Retry the first time, then give up
            if (retryCount < 1) {
              this.logger.log(`Retrying after ${retryAfter} seconds`);
              return true;
            }

            this.logger.warn(
              `Rate limit retry exhausted for ${options.method} ${options.url}`,
            );
            return false;
          },
          onSecondaryRateLimit: (retryAfter, options) => {
            this.logger.warn(
              `Secondary rate limit detected for ${options.method} ${options.url}`,
            );
            // Don't retry on secondary rate limits
            return false;
          },
        },
      };

    // Add GitHub PAT if provided via environment variable
    if (process.env.GITHUB_TOKEN) {
      octokitOptions.auth = process.env.GITHUB_TOKEN;
      this.logger.log('GitHub API authentication configured with provided token');
    }

    return new OctokitWithPlugins(octokitOptions);
  }

  /**
   * Get the latest release for a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @returns Latest release information or undefined if unavailable
   */
  public async getLatestRelease(
    owner: string,
    repo: string,
  ): Promise<GitHubRelease | undefined> {
    const cacheKey = `release:${owner}/${repo}:latest`;
    const cached = this.cache?.data.get<GitHubRelease>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const octokit = await this.octokitPromise;
      const response = await octokit.rest.repos.getLatestRelease({
        owner,
        repo,
      });
      const release = response.data as GitHubRelease;

      this.cache?.data.set(cacheKey, release);

      return release;
    } catch (err) {
      this.logger.debug(
        `Failed to fetch latest release for ${owner}/${repo}: ${err.message}`,
      );
      return undefined;
    }
  }

  /**
   * Get a specific commit from a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @param ref Commit SHA or branch name
   * @returns Commit information or undefined if unavailable
   */
  public async getCommit(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHubCommit | undefined> {
    const cacheKey = `commit:${owner}/${repo}:${ref}`;
    const cached = this.cache?.data.get<GitHubCommit>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const octokit = await this.octokitPromise;
      const response = await octokit.rest.repos.getCommit({
        owner,
        repo,
        ref,
      });
      const commit = { sha: response.data.sha };

      this.cache?.data.set(cacheKey, commit);

      return commit;
    } catch (err) {
      this.logger.debug(
        `Failed to fetch commit ${ref} for ${owner}/${repo}: ${err.message}`,
      );
      return undefined;
    }
  }

  /**
   * Get multiple releases for a repository
   * @param owner Repository owner
   * @param repo Repository name
   * @param perPage Number of releases to fetch (default: 10)
   * @returns Array of releases or undefined if unavailable
   */
  public async getReleases(
    owner: string,
    repo: string,
    perPage: number = 10,
  ): Promise<GitHubRelease[] | undefined> {
    const cacheKey = `releases:${owner}/${repo}:${perPage}`;
    const cached = this.cache?.data.get<GitHubRelease[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const octokit = await this.octokitPromise;
      const response = await octokit.rest.repos.listReleases({
        owner,
        repo,
        per_page: perPage,
      });
      const releases = response.data as GitHubRelease[];

      this.cache?.data.set(cacheKey, releases);

      return releases;
    } catch (err) {
      this.logger.debug(
        `Failed to fetch releases for ${owner}/${repo}: ${err.message}`,
      );
      return undefined;
    }
  }
}
