import { DISKSPACE_REMAINING_PROPERTY } from '@maintainerr/contracts';
import { evaluateArrDiskspaceGiB } from './diskspace.utils';

const GiB = 1073741824;

const mount = (path: string, freeSpace: number) => ({
  id: 1,
  path,
  label: null,
  freeSpace,
  totalSpace: freeSpace * 2,
  hasAccurateTotalSpace: true,
});

const evaluate = (
  client: Partial<{
    getDiskspace: jest.Mock;
    getDiskspaceWithRootFolders: jest.Mock;
  }>,
  property = DISKSPACE_REMAINING_PROPERTY,
  rule?: { arrDiskPath?: string },
) =>
  evaluateArrDiskspaceGiB(
    {
      getDiskspace: jest.fn(),
      getDiskspaceWithRootFolders: jest.fn(),
      ...client,
    } as never,
    property,
    rule as never,
    'Radarr',
    jest.fn(),
  );

describe('evaluateArrDiskspaceGiB', () => {
  it('reports free space across the matching mounts', async () => {
    const result = await evaluate({
      getDiskspaceWithRootFolders: jest
        .fn()
        .mockResolvedValue([mount('/movies', 2 * GiB), mount('/tv', 3 * GiB)]),
    });

    expect(result).toBe(5);
  });

  // A failed arr call read as a confirmed figure is the #3307 failure mode: the
  // rule compares against a number that was never measured, and the executor
  // removes the items it was protecting.
  it('answers undefined when the read failed', async () => {
    await expect(
      evaluate({
        getDiskspaceWithRootFolders: jest.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toBeUndefined();
  });

  it('answers undefined when the client throws', async () => {
    await expect(
      evaluate({
        getDiskspaceWithRootFolders: jest
          .fn()
          .mockRejectedValue(new Error('boom')),
      }),
    ).rejects.toThrow('boom');
  });

  // Definitive answers stay null - the instance replied, it just has nothing to
  // report for this rule.
  it.each([
    ['the instance reports no disks', [], undefined],
    [
      'no mount matches the configured path',
      [mount('/movies', 2 * GiB)],
      { arrDiskPath: '/nothing-here' },
    ],
  ])('answers null when %s', async (label, mounts, rule) => {
    await expect(
      evaluate(
        { getDiskspaceWithRootFolders: jest.fn().mockResolvedValue(mounts) },
        DISKSPACE_REMAINING_PROPERTY,
        rule,
      ),
    ).resolves.toBeNull();
  });
});
