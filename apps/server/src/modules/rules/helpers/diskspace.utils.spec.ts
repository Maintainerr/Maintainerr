import {
  DISKSPACE_REMAINING_PERCENT_PROPERTY,
  DISKSPACE_REMAINING_PROPERTY,
} from '@maintainerr/contracts';
import { evaluateArrDiskspaceGiB } from './diskspace.utils';

const GiB = 1073741824;

const mount = (
  path: string,
  freeSpace: number,
  totalSpace = freeSpace * 2,
  hasAccurateTotalSpace = true,
) => ({
  id: 1,
  path,
  label: null,
  freeSpace,
  totalSpace,
  hasAccurateTotalSpace,
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

  it.each([
    ['across all mounts', undefined, 40],
    ['for the configured path', { arrDiskPath: '/movies' }, 25],
  ])(
    'reports remaining space as a percentage of the total %s',
    async (label, rule, expected) => {
      const result = await evaluate(
        {
          getDiskspaceWithRootFolders: jest
            .fn()
            .mockResolvedValue([
              mount('/movies', 1 * GiB, 4 * GiB),
              mount('/tv', 1 * GiB, 1 * GiB),
            ]),
        },
        DISKSPACE_REMAINING_PERCENT_PROPERTY,
        rule,
      );

      expect(result).toBe(expected);
    },
  );

  // A root-folder fallback carries no reliable total, so a percentage over it
  // would be measured against a guess.
  it('answers null for a percentage when a mount has no reliable total', async () => {
    await expect(
      evaluate(
        {
          getDiskspaceWithRootFolders: jest
            .fn()
            .mockResolvedValue([
              mount('/movies', 1 * GiB, 4 * GiB),
              mount('/nfs', 1 * GiB, 0, false),
            ]),
        },
        DISKSPACE_REMAINING_PERCENT_PROPERTY,
      ),
    ).resolves.toBeNull();
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
