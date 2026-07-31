import { TestBed } from '@suites/unit';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { LeftoverFolderCleanupService } from './leftover-folder-cleanup.service';

// Exercises the destructive guardrail pipeline against a real temp filesystem.
describe('LeftoverFolderCleanupService', () => {
  let service: LeftoverFolderCleanupService;
  let tmp: string;

  // lstat, so a surviving symlink is not mistaken for a deleted one.
  const exists = async (p: string): Promise<boolean> => {
    try {
      await lstat(p);
      return true;
    } catch {
      return false;
    }
  };

  // A movie/show layout: <root>/<title>/ with the given leftover files. Returns
  // the folder plus the path of a "media file" that the *arr just deleted from
  // it, which every cleanup needs as proof it is looking at the right folder.
  const makeItemFolder = async (
    root: string,
    title: string,
    files: string[],
  ): Promise<{ folder: string; deletedFilePaths: string[] }> => {
    const folder = join(root, title);
    await mkdir(folder, { recursive: true });
    for (const file of files) {
      const full = join(folder, file);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, 'x');
    }
    return { folder, deletedFilePaths: [join(folder, 'deleted.mkv')] };
  };

  beforeEach(async () => {
    const { unit } = await TestBed.solitary(
      LeftoverFolderCleanupService,
    ).compile();
    service = unit;
    tmp = await mkdtemp(join(tmpdir(), 'leftover-cleanup-'));
  });

  afterEach(async () => {
    await chmod(tmp, 0o755).catch(() => undefined);
    await rm(tmp, { recursive: true, force: true });
  });

  it('removes a leftover folder with only stray files', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const { folder, deletedFilePaths } = await makeItemFolder(
      root,
      'Sample Movie (2024)',
      [
        'Sample Movie.srt',
        'movie.nfo',
        'poster.jpg',
        '.DS_Store',
        'Subs/2_English.srt',
      ],
    );

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      deletedFilePaths,
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(false);
  });

  it('aborts when a video file still remains anywhere under the folder', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const { folder, deletedFilePaths } = await makeItemFolder(
      root,
      'Sample Movie',
      [
        'extra.srt',
        'Subs/keep.MKV', // nested + mixed-case extension
      ],
    );

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      deletedFilePaths,
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('keeps a folder whose media is a symlink, and leaves the link intact', async () => {
    const root = join(tmp, 'movies');
    const store = join(tmp, 'remote-store');
    await mkdir(root, { recursive: true });
    await mkdir(store, { recursive: true });
    await writeFile(join(store, 'real.mkv'), 'media');
    const { folder, deletedFilePaths } = await makeItemFolder(
      root,
      'Sample Movie',
      ['poster.jpg'],
    );
    const link = join(folder, 'Sample Movie.mkv');
    await symlink(join(store, 'real.mkv'), link);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      deletedFilePaths,
      scope: 'movie',
    });

    // A symlink-backed library (rclone/zurg, atomic-move layouts) must survive:
    // readdir reports the link as neither a file nor a directory, so it has to
    // block removal rather than be silently unlinked.
    expect(await exists(folder)).toBe(true);
    expect(await exists(link)).toBe(true);
  });

  it('refuses to remove a root folder itself', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'stray.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: root,
      rootFolderPaths: [root],
      deletedFilePaths: [join(root, 'deleted.mkv')],
      scope: 'movie',
    });

    expect(await exists(root)).toBe(true);
  });

  it('refuses a path that is not inside any known root', async () => {
    const root = join(tmp, 'movies');
    const other = join(tmp, 'elsewhere');
    await mkdir(root, { recursive: true });
    await mkdir(other, { recursive: true });
    const { folder, deletedFilePaths } = await makeItemFolder(
      other,
      'Sample Movie',
      ['a.srt'],
    );

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      deletedFilePaths,
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('refuses a folder that holds another tracked item', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const { folder, deletedFilePaths } = await makeItemFolder(root, 'Boxset', [
      'poster.jpg',
    ]);
    const otherItem = join(folder, 'Part 2');
    await mkdir(otherItem, { recursive: true });
    await writeFile(join(otherItem, 'poster.jpg'), 'x');

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      deletedFilePaths,
      otherItemPaths: [otherItem],
      scope: 'movie',
    });

    expect(await exists(otherItem)).toBe(true);
    expect(await exists(folder)).toBe(true);
  });

  it('skips when no root folders are provided (empty-fence guard)', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const { folder, deletedFilePaths } = await makeItemFolder(
      root,
      'Sample Movie',
      ['a.srt'],
    );

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [''],
      deletedFilePaths,
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('skips when no root folder is visible to Maintainerr (library not mounted)', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const { folder, deletedFilePaths } = await makeItemFolder(
      root,
      'Sample Movie',
      ['a.srt'],
    );

    await service.cleanupAfterDelete({
      folderPath: folder,
      // The path the *arr reports, which does not exist in this container.
      rootFolderPaths: [join(tmp, 'not-mounted')],
      deletedFilePaths,
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('skips when none of the deleted files came from this folder', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const { folder } = await makeItemFolder(root, 'Sample Movie', ['a.srt']);

    await service.cleanupAfterDelete({
      folderPath: folder,
      rootFolderPaths: [root],
      deletedFilePaths: [join(root, 'Another Movie', 'deleted.mkv')],
      scope: 'movie',
    });

    expect(await exists(folder)).toBe(true);
  });

  it('refuses to remove a symlinked folder', async () => {
    const root = join(tmp, 'movies');
    await mkdir(root, { recursive: true });
    const realTarget = join(tmp, 'real-movie');
    await mkdir(realTarget, { recursive: true });
    await writeFile(join(realTarget, 'a.srt'), 'x');
    const link = join(root, 'Sample Movie');
    await symlink(realTarget, link);

    await service.cleanupAfterDelete({
      folderPath: link,
      rootFolderPaths: [root],
      deletedFilePaths: [join(link, 'deleted.mkv')],
      scope: 'movie',
    });

    expect(await exists(realTarget)).toBe(true);
    expect(await exists(link)).toBe(true);
  });

  it('removes a season subfolder strictly under the series folder', async () => {
    const root = join(tmp, 'tv');
    const series = join(root, 'Sample Series');
    const season = join(series, 'Season 01');
    await mkdir(season, { recursive: true });
    await writeFile(join(season, 'episode.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: season,
      rootFolderPaths: [root],
      deletedFilePaths: [join(season, 'episode.mkv')],
      scope: 'season',
      parentPath: series,
    });

    expect(await exists(season)).toBe(false);
    expect(await exists(series)).toBe(true);
  });

  it('skips a season cleanup whose folder equals the series root (seasonFolder off)', async () => {
    const root = join(tmp, 'tv');
    const series = join(root, 'Sample Series');
    await mkdir(series, { recursive: true });
    await writeFile(join(series, 'episode.srt'), 'x');

    await service.cleanupAfterDelete({
      folderPath: series,
      rootFolderPaths: [root],
      deletedFilePaths: [join(series, 'episode.mkv')],
      scope: 'season',
      parentPath: series,
    });

    expect(await exists(series)).toBe(true);
  });
});
