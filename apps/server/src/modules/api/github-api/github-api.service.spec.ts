import { existsSync, readFileSync, renameSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { GitHubApiService } from './github-api.service';

const cacheSet = jest.fn();
const cacheGet = jest.fn();
const getLatestRelease = jest.fn();

jest.mock('../../logging/logs.service', () => ({
  MaintainerrLogger: class MaintainerrLogger {},
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  renameSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('../../../app/config/dataDir', () => ({
  dataDir: '/tmp/maintainerr',
}));

jest.mock('../lib/cache', () => ({
  __esModule: true,
  default: {
    getCache: jest.fn(() => ({
      data: {
        get: cacheGet,
        set: cacheSet,
        options: { stdTTL: 86400 },
      },
    })),
  },
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@octokit/plugin-throttling', () => ({
  throttling: {},
}));

jest.mock('octokit', () => {
  class MockOctokit {
    public rest = {
      repos: {
        getLatestRelease,
        getCommit: jest.fn(),
        listReleases: jest.fn(),
      },
    };

    static plugin() {
      return MockOctokit;
    }
  }

  return {
    Octokit: MockOctokit,
  };
});

describe('GitHubApiService', () => {
  const actualDateNow = Date.now;

  let logger: {
    setContext: jest.Mock;
    log: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getLatestRelease.mockReset();

    logger = {
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
  });

  afterAll(() => {
    Date.now = actualDateNow;
  });

  it('restores only non-expired persisted cache entries on startup', () => {
    Date.now = jest.fn(() => 1_000_000);
    (existsSync as jest.Mock).mockReturnValue(true);
    (readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        fresh: {
          value: { tag_name: 'v1.0.0' },
          expiresAt: 1_010_000,
        },
        expired: {
          value: { tag_name: 'v0.9.0' },
          expiresAt: 999_000,
        },
      }),
    );

    new GitHubApiService(logger as never);

    expect(cacheSet).toHaveBeenCalledTimes(1);
    expect(cacheSet).toHaveBeenCalledWith('fresh', { tag_name: 'v1.0.0' }, 10);
  });

  it('warns and quarantines the cache file when persisted GitHub cache is corrupt', () => {
    Date.now = jest.fn(() => 1_234_567);
    (existsSync as jest.Mock).mockReturnValue(true);
    (readFileSync as jest.Mock).mockImplementation(() => {
      throw new SyntaxError('Unexpected token');
    });

    new GitHubApiService(logger as never);

    expect(logger.warn).toHaveBeenCalledWith(
      'GitHub cache persistence file is corrupt. Ignoring persisted entries.',
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.any(SyntaxError));
    expect(renameSync).toHaveBeenCalledWith(
      join('/tmp/maintainerr', 'github-cache.json'),
      join('/tmp/maintainerr', 'github-cache.json.corrupt-1234567'),
    );
  });

  it('persists cache entries without re-reading the persistence file after startup', async () => {
    (existsSync as jest.Mock).mockReturnValue(false);
    cacheGet.mockReturnValue(undefined);
    getLatestRelease.mockResolvedValue({
      data: {
        tag_name: 'v1.0.0',
        name: 'v1.0.0',
        body: '',
        html_url:
          'https://github.com/Maintainerr/Maintainerr/releases/tag/v1.0.0',
        created_at: '2026-04-02T00:00:00.000Z',
        published_at: '2026-04-02T00:00:00.000Z',
      },
    });

    const service = new GitHubApiService(logger as never);

    await service.getLatestRelease('Maintainerr', 'Maintainerr');
    await Promise.resolve();
    await Promise.resolve();

    expect(readFileSync).not.toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      join('/tmp/maintainerr', 'github-cache.json'),
      expect.any(String),
      'utf8',
    );
  });
});
