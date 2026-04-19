import type { ArrDiskspaceResource } from '@maintainerr/contracts';
import type { MaintainerrLogger } from '../../../logging/logs.service';
import { ServarrApi } from './servarr-api.service';

class TestServarrApi extends ServarrApi<Record<string, never>> {}

describe('ServarrApi', () => {
  let api: TestServarrApi;
  let logger: jest.Mocked<MaintainerrLogger>;

  beforeEach(() => {
    logger = {
      setContext: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<MaintainerrLogger>;

    api = new TestServarrApi(
      { url: 'http://localhost:7878', apiKey: 'test' },
      logger,
    );
  });

  it('returns diskspace mounts unchanged when root folders are unavailable', async () => {
    const diskspace: ArrDiskspaceResource[] = [
      {
        id: 1,
        path: '/movies',
        label: null,
        freeSpace: 100,
        totalSpace: 200,
        hasAccurateTotalSpace: true,
      },
    ];

    jest.spyOn(api as any, 'getDiskspace').mockResolvedValue(diskspace);
    jest.spyOn(api as any, 'getRootFolders').mockResolvedValue(undefined);

    await expect(api.getDiskspaceAndRootFolders()).resolves.toEqual({
      mounts: diskspace,
      rootFolderPaths: new Set(),
    });
  });
});
