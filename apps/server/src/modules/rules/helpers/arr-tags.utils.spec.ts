import { resolveArrTagNames } from './arr-tags.utils';

const makeTags = (entries: [number, string][]) =>
  entries.map(([id, label]) => ({ id, label }));

describe('resolveArrTagNames', () => {
  it('returns matching label strings for given IDs', async () => {
    const client = {
      getTags: jest.fn().mockResolvedValue(
        makeTags([
          [1, 'action'],
          [2, 'comedy'],
          [3, 'drama'],
        ]),
      ),
    };
    await expect(resolveArrTagNames([1, 3], client)).resolves.toEqual([
      'action',
      'drama',
    ]);
  });

  it('returns empty array when no IDs match', async () => {
    const client = {
      getTags: jest.fn().mockResolvedValue(makeTags([[1, 'action']])),
    };
    await expect(resolveArrTagNames([99], client)).resolves.toEqual([]);
  });

  it('returns empty array when tagIds is empty', async () => {
    const client = {
      getTags: jest.fn().mockResolvedValue(makeTags([[1, 'action']])),
    };
    await expect(resolveArrTagNames([], client)).resolves.toEqual([]);
  });

  it('returns undefined when getTags returns undefined (API failure)', async () => {
    const client = { getTags: jest.fn().mockResolvedValue(undefined) };
    await expect(resolveArrTagNames([1], client)).resolves.toBeUndefined();
  });

  it('behaves identically for Radarr-style and Sonarr-style tag payloads', async () => {
    const tags = makeTags([
      [10, 'hd'],
      [20, '4k'],
    ]);
    const radarrClient = { getTags: jest.fn().mockResolvedValue(tags) };
    const sonarrClient = { getTags: jest.fn().mockResolvedValue(tags) };
    const radarrResult = await resolveArrTagNames([10, 20], radarrClient);
    const sonarrResult = await resolveArrTagNames([10, 20], sonarrClient);
    expect(radarrResult).toEqual(sonarrResult);
  });
});
