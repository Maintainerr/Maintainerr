import { Mocked } from '@suites/doubles.jest';
import { TestBed } from '@suites/unit';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, sep } from 'path';
import { SettingsDataService } from '../settings/settings-data.service';
import { LeftoverFolderCleanupService } from './leftover-folder-cleanup.service';

// Exercises the destructive guardrail pipeline against a real temp filesystem.
describe('LeftoverFolderCleanupService', () => {
  let service: LeftoverFolderCleanupService;
  let settings: Mocked<SettingsDataService>;
  let tmp: string;

  const exists = async (p: string): Promise<boolean> => {
    try {
      await import('fs/promises').then((fs) => fs.stat(p));
      return true;
    } catch {
      return false;
    }
  };

  // A movie/show layout: <root>/<title>/ with the given leftover files.
  const makeItemFolder = async (
    root: string,
    title: string,
    files: string[],
  ): Promise<string> => {
    const folder = join(root, title);
    await mkdir(folder, { recursive: true });
    for (const file of files) {
      const full = join(folder, file);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, 'x');
    }
    return folder;
  };

  beforeEach(async () => {
    const { unit, unitRef } = await TestBed.solitary(
      LeftoverFolderCleanupService,
    ).compile();
    service = unit;
    settings = unitRef.get(SettingsDataService);
    (
      settings as unknown as { leftover_cleanup_enabled: boolean }
    ).leftover_cleanup_enabled = true;
    tmp = await mkdtemp(join(tmpdir(), 'leftover-cleanup-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('removes a leftover folder with only stray files', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const folder = await makeItemFolder(root, 'Sample Movie (2024)', [
      'Sample Movie.srt',
      'Sample Movie.nfo',
      'Trailers/trailer.txt',
    ]);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(false);
  });

  it('does nothing when the feature is disabled', async () => {
    (
      settings as unknown as { leftover_cleanup_enabled: boolean }
    ).leftover_cleanup_enabled = false;
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const folder = await makeItemFolder(root, 'Sample Movie', ['a.srt']);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('aborts when a video file still remains anywhere under the folder', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const folder = await makeItemFolder(root, 'Sample Movie', [
      'extra.srt',
      'Subs/keep.MKV', // nested + mixed-case extension
    ]);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('keeps a folder containing an unrecognized (non-sidecar) file (fail-safe)', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    // An extension the sidecar allowlist doesn't know — must NOT be deleted.
    const folder = await makeItemFolder(root, 'Sample Movie', [
      'subs.srt',
      'mystery.xyz',
    ]);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('removes a folder whose only leftovers are sidecars and OS junk files', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const folder = await makeItemFolder(root, 'Sample Movie', [
      'movie.en.srt',
      'poster.jpg',
      'movie.nfo',
      '.DS_Store',
      'Thumbs.db',
      'Subs/movie.eng.ass',
    ]);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(false);
  });

  it('refuses to remove a root folder itself', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'loose.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: root,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(root)).toBe(true);
  });

  it('refuses a path that is not inside any known root', async () => {
    const root = join(tmp, 'movies');
    const outside = join(tmp, 'elsewhere', 'Sample Movie');
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'a.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: outside,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(outside)).toBe(true);
  });

  it('does not treat a sibling-prefix root as containing (/movies vs /movies-2)', async () => {
    const root = join(tmp, 'movies');
    const sibling = join(tmp, 'movies-2');
    await mkdir(root, { recursive: true });
    const folder = await makeItemFolder(sibling, 'Sample Movie', ['a.srt']);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root], // only /movies is a root, not /movies-2
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('refuses a folder that is an ancestor of another root', async () => {
    const base = join(tmp, 'base');
    const innerRoot = join(base, 'lib', 'movies');
    const candidate = join(base, 'lib'); // contains a root
    await mkdir(innerRoot, { recursive: true });
    await writeFile(join(candidate, 'a.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: candidate,
      rootFolderPaths: [base, innerRoot],
      scope: 'movie',
    });

    expect(await exists(candidate)).toBe(true);
  });

  it('skips when no root folders are provided (empty-fence guard)', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const folder = await makeItemFolder(root, 'Sample Movie', ['a.srt']);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it("refuses a path containing '..'", async () => {
    const root = join(tmp, 'movies');
    const folder = await makeItemFolder(root, 'Sample Movie', ['a.srt']);

    // Raw string with a literal '..' segment (join would normalize it away).
    await service.cleanupAfterDelete({
      folderPath: `${folder}${sep}..${sep}Sample Movie`,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('refuses a non-absolute path', async () => {
    const root = join(tmp, 'movies');
    const folder = await makeItemFolder(root, 'Sample Movie', ['a.srt']);

    await service.cleanupAfterDelete({
      folderPath: 'movies/Sample Movie',
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('refuses to remove a symlinked folder', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const realTarget = await makeItemFolder(root, 'real', ['a.srt']);
    const link = join(root, 'link');
    await symlink(realTarget, link);

    await service.cleanupAfterDelete({
      folderPath: link,
      rootFolderPaths: [root],
      scope: 'movie',
    });

    expect(await exists(realTarget)).toBe(true);
    expect(await exists(link)).toBe(true);
  });

  it('treats an already-gone folder as a no-op (no throw)', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });

    await expect(
      service.cleanupAfterDelete({
        folderPath: join(root, 'does-not-exist'),
        rootFolderPaths: [root],
        scope: 'movie',
      }),
    ).resolves.toBeUndefined();
  });

  it('removes a season subfolder strictly under the series folder', async () => {
    const root = join(tmp, 'tv');
    const series = join(root, 'Sample Series');
    const season = join(series, 'Season 01');
    await mkdir(season, { recursive: true });
    await writeFile(join(season, 'ep.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: season,
      rootFolderPaths: [root],
      scope: 'season',
      parentPath: series,
    });

    expect(await exists(season)).toBe(false);
    expect(await exists(series)).toBe(true); // series folder untouched
  });

  it('skips a season cleanup whose folder equals the series root (seasonFolder off)', async () => {
    const root = join(tmp, 'tv');
    const series = join(root, 'Sample Series');
    await mkdir(series, { recursive: true });
    await writeFile(join(series, 'ep.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: series, // episodes live in the series root
      rootFolderPaths: [root],
      scope: 'season',
      parentPath: series,
    });

    expect(await exists(series)).toBe(true);
  });

  it('skips a season cleanup with no parent path', async () => {
    const root = join(tmp, 'tv');
    const season = join(root, 'Sample Series', 'Season 01');
    await mkdir(season, { recursive: true });
    await writeFile(join(season, 'ep.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: season,
      rootFolderPaths: [root],
      scope: 'season',
      parentPath: undefined,
    });

    expect(await exists(season)).toBe(true);
  });
});
