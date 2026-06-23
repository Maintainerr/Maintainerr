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

  describe('ensureTag', () => {
    it('returns an existing tag id without creating (case-insensitive match)', async () => {
      jest.spyOn(api, 'getTags').mockResolvedValue([{ id: 7, label: 'DND' }]);
      const createTag = jest.spyOn(api, 'createTag');

      await expect(api.ensureTag('dnd')).resolves.toBe(7);
      expect(createTag).not.toHaveBeenCalled();
    });

    it('creates the tag when missing and returns the new id', async () => {
      jest.spyOn(api, 'getTags').mockResolvedValue([]);
      jest.spyOn(api, 'createTag').mockResolvedValue({ id: 12, label: 'dnd' });

      await expect(api.ensureTag('dnd')).resolves.toBe(12);
    });

    it('is race-tolerant: re-reads and returns the id when create fails', async () => {
      // First read: absent. Create fails (undefined) because a concurrent caller
      // created it. Second read: now present.
      jest
        .spyOn(api, 'getTags')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 3, label: 'dnd' }]);
      jest.spyOn(api, 'createTag').mockResolvedValue(undefined);

      await expect(api.ensureTag('dnd')).resolves.toBe(3);
    });

    it('returns undefined when the id cannot be resolved (best-effort)', async () => {
      jest.spyOn(api, 'getTags').mockResolvedValue([]);
      jest.spyOn(api, 'createTag').mockResolvedValue(undefined);

      await expect(api.ensureTag('dnd')).resolves.toBeUndefined();
    });
  });
});
