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

  // This used to tolerate a failed root folder read and return the disk space
  // mounts alone. Measured against a real Radarr, that shape reported 3.9 GB
  // free where the instance had 15.4 - the missing side only ever understates
  // free space, which is exactly what fires a "delete when space runs low"
  // rule. Both reads now have to succeed.
  it('throws when the root folder read fails, rather than reporting a partial view', async () => {
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

    await expect(api.getDiskspaceAndRootFolders()).rejects.toThrow(
      'Failed to read disk space',
    );
  });

  it('merges root folders the disk space read omitted', async () => {
    jest.spyOn(api as any, 'getDiskspace').mockResolvedValue([
      {
        id: 1,
        path: '/movies',
        label: null,
        freeSpace: 100,
        totalSpace: 200,
        hasAccurateTotalSpace: true,
      },
    ]);
    jest
      .spyOn(api as any, 'getRootFolders')
      .mockResolvedValue([{ id: 2, path: '/tv', freeSpace: 50 }]);

    const { mounts, rootFolderPaths } = await api.getDiskspaceAndRootFolders();

    expect(mounts.map((mount) => mount.path)).toEqual(['/movies', '/tv']);
    expect(rootFolderPaths).toEqual(new Set(['/tv']));
  });

  // An empty mount list reads as "this instance has no disks", which a
  // free-space rule then acts on. Only a genuine answer may say that.
  it('throws instead of reporting no mounts when the disk space read fails', async () => {
    jest.spyOn(api as any, 'getDiskspace').mockResolvedValue(undefined);
    jest.spyOn(api as any, 'getRootFolders').mockResolvedValue([]);

    await expect(api.getDiskspaceAndRootFolders()).rejects.toThrow(
      'Failed to read disk space',
    );
  });

  it('reports an instance that genuinely has no disks as empty', async () => {
    jest.spyOn(api as any, 'getDiskspace').mockResolvedValue([]);
    jest.spyOn(api as any, 'getRootFolders').mockResolvedValue([]);

    await expect(api.getDiskspaceAndRootFolders()).resolves.toEqual({
      mounts: [],
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

  describe('getRootFolders caching', () => {
    it('serves the rolling cache by default', async () => {
      const rolling = jest
        .spyOn(api as any, 'getRolling')
        .mockResolvedValue([{ id: 1, path: '/movies' }]);
      const uncached = jest.spyOn(api as any, 'getWithoutCache');

      await api.getRootFolders();

      expect(rolling).toHaveBeenCalledWith('/rootfolder', undefined, 3600);
      expect(uncached).not.toHaveBeenCalled();
    });

    // The leftover-folder cleanup only deletes inside a root folder, so it asks
    // for a fresh list: an hour-old fence is not a fence.
    it('bypasses the cache when the caller asks for a fresh read', async () => {
      const rolling = jest.spyOn(api as any, 'getRolling');
      const uncached = jest
        .spyOn(api as any, 'getWithoutCache')
        .mockResolvedValue([{ id: 1, path: '/movies' }]);

      await api.getRootFolders({ fresh: true });

      expect(uncached).toHaveBeenCalledWith('/rootfolder', expect.any(Object));
      expect(rolling).not.toHaveBeenCalled();
    });
  });
});
