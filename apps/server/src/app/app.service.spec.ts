import { AppService } from './app.service';

describe('AppService', () => {
  const envBackup = { ...process.env };

  let githubApi: {
    getLatestRelease: jest.Mock;
    getCommit: jest.Mock;
  };
  let logger: {
    setContext: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
    warn: jest.Mock;
  };
  let service: AppService;

  beforeEach(() => {
    process.env = { ...envBackup };

    githubApi = {
      getLatestRelease: jest.fn(),
      getCommit: jest.fn(),
    };

    logger = {
      setContext: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };

    service = new AppService(githubApi as never, logger as never);
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('treats stable builds as release builds for version formatting and update checks', async () => {
    process.env.npm_package_version = '3.3.0';
    process.env.VERSION_TAG = 'stable';
    process.env.GIT_SHA = 'bd8a1e0123456789';
    process.env.NODE_ENV = 'production';

    githubApi.getLatestRelease.mockResolvedValue({ tag_name: 'v3.3.0' });

    await expect(service.getAppVersionStatus()).resolves.toEqual({
      status: 1,
      version: '3.3.0',
      commitTag: 'stable-bd8a1e0',
      updateAvailable: false,
    });

    expect(githubApi.getLatestRelease).toHaveBeenCalledWith(
      'Maintainerr',
      'Maintainerr',
    );
    expect(githubApi.getCommit).not.toHaveBeenCalled();
  });

  it('keeps latest builds on the release path', async () => {
    process.env.npm_package_version = '3.3.0';
    process.env.VERSION_TAG = 'latest';
    process.env.GIT_SHA = 'bd8a1e0123456789';
    process.env.NODE_ENV = 'production';

    githubApi.getLatestRelease.mockResolvedValue({ tag_name: 'v3.4.0' });

    await expect(service.getAppVersionStatus()).resolves.toEqual({
      status: 1,
      version: '3.3.0',
      commitTag: 'latest-bd8a1e0',
      updateAvailable: true,
    });

    expect(githubApi.getLatestRelease).toHaveBeenCalledWith(
      'Maintainerr',
      'Maintainerr',
    );
    expect(githubApi.getCommit).not.toHaveBeenCalled();
  });

  it('compares development builds against the development branch head', async () => {
    process.env.npm_package_version = '3.3.0';
    process.env.VERSION_TAG = 'development';
    process.env.GIT_SHA = 'bd8a1e0123456789';
    process.env.NODE_ENV = 'production';

    githubApi.getCommit.mockResolvedValue({ sha: 'bd8a1e0123456789' });

    await expect(service.getAppVersionStatus()).resolves.toEqual({
      status: 1,
      version: 'development-bd8a1e0',
      commitTag: '',
      updateAvailable: false,
    });

    expect(githubApi.getCommit).toHaveBeenCalledWith(
      'Maintainerr',
      'Maintainerr',
      'development',
    );
    expect(githubApi.getLatestRelease).not.toHaveBeenCalled();
  });

  it('compares main builds against the main branch head', async () => {
    process.env.npm_package_version = '3.3.0';
    process.env.VERSION_TAG = 'main';
    process.env.GIT_SHA = 'bd8a1e0123456789';
    process.env.NODE_ENV = 'production';

    githubApi.getCommit.mockResolvedValue({ sha: 'fffffffffffffff0' });

    await expect(service.getAppVersionStatus()).resolves.toEqual({
      status: 1,
      version: 'main-bd8a1e0',
      commitTag: '',
      updateAvailable: true,
    });

    expect(githubApi.getCommit).toHaveBeenCalledWith(
      'Maintainerr',
      'Maintainerr',
      'main',
    );
    expect(githubApi.getLatestRelease).not.toHaveBeenCalled();
  });

  it('keeps local development builds marked as local', async () => {
    process.env.npm_package_version = '3.3.0';
    process.env.VERSION_TAG = 'development';
    process.env.GIT_SHA = 'bd8a1e0123456789';
    process.env.NODE_ENV = 'development';

    githubApi.getCommit.mockResolvedValue({ sha: 'bd8a1e0123456789' });

    await expect(service.getAppVersionStatus()).resolves.toEqual({
      status: 1,
      version: 'development-bd8a1e0',
      commitTag: 'local',
      updateAvailable: false,
    });
  });
});
