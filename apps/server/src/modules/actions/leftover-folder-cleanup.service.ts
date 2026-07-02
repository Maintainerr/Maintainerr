import { Injectable } from '@nestjs/common';
import { lstat, readdir, realpath, rm, stat } from 'fs/promises';
import { isAbsolute, join, sep } from 'path';
import { MaintainerrLogger } from '../logging/logs.service';
import { SettingsDataService } from '../settings/settings-data.service';

export type LeftoverCleanupScope = 'movie' | 'series' | 'season';

/**
 * The master safety gate is an allowlist, not a media denylist, on purpose: a
 * destructive delete must fail safe. A folder is only removed when every file
 * left in it is a recognized sidecar the *arr leaves behind (subtitles,
 * metadata, artwork, …); anything unrecognized — a media file, or just an
 * extension we don't know — keeps the folder. A missing entry here therefore
 * only ever leaves a folder uncleaned, never deletes real data (whereas a
 * missing entry in a "video extensions" denylist would delete a kept media
 * file). Matched on the lower-cased extension.
 */
const COMPANION_EXTENSIONS: ReadonlySet<string> = new Set([
  // subtitles
  'srt',
  'sub',
  'idx',
  'ssa',
  'ass',
  'vtt',
  'smi',
  'sup',
  // metadata
  'nfo',
  'xml',
  'json',
  // artwork
  'jpg',
  'jpeg',
  'png',
  'tbn',
  'bmp',
  'gif',
  'webp',
  // text / logs
  'txt',
  'md',
  'log',
]);

/** OS/junk files (matched on the full lower-cased name) that also don't block removal. */
const COMPANION_FILENAMES: ReadonlySet<string> = new Set([
  '.ds_store',
  'thumbs.db',
  '.directory',
]);

export interface LeftoverCleanupInput {
  /** The media folder reported by the *arr, in the *arr's namespace. */
  folderPath: string | undefined;
  /** The *arr `/rootfolder` paths — the only places a delete may touch. */
  rootFolderPaths: string[];
  scope: LeftoverCleanupScope;
  /** Series folder; required for `season` scope to prove a real subfolder. */
  parentPath?: string;
  /** Title, for log lines only. */
  label?: string;
}

/**
 * Force-removes the folder left behind after a confirmed file-deleting *arr
 * action (Sonarr in particular leaves the folder + stray .srt/.nfo/trailers).
 * Opt-in via the global `leftover_cleanup_enabled` setting and off by default.
 *
 * Best-effort, like {@link DownloadClientApiService.removeDownloads}: the media
 * is already gone by the time this runs, so it must never throw into the caller.
 * Every gate is fail-closed — on any doubt the folder is left untouched. v1
 * assumes the library is mounted into Maintainerr at the same path the *arr
 * reports; when it isn't visible the guardrails simply no-op.
 */
@Injectable()
export class LeftoverFolderCleanupService {
  constructor(
    private readonly settings: SettingsDataService,
    private readonly logger: MaintainerrLogger,
  ) {
    logger.setContext(LeftoverFolderCleanupService.name);
  }

  public isEnabled(): boolean {
    return this.settings.leftover_cleanup_enabled === true;
  }

  public async cleanupAfterDelete(input: LeftoverCleanupInput): Promise<void> {
    const label = input.label ? ` for '${input.label}'` : '';
    try {
      if (!this.isEnabled()) {
        return;
      }

      if (!input.folderPath) {
        this.logger.debug(
          `[FolderCleanup] No folder path available${label}; skipping.`,
        );
        return;
      }

      // No known root means no fence — the classic empty-`$VAR` `rm -rf` trap.
      const rawRoots = (input.rootFolderPaths ?? []).filter(
        (p) => typeof p === 'string' && p.trim().length > 0,
      );
      if (rawRoots.length === 0) {
        this.logger.warn(
          `[FolderCleanup] No *arr root folders resolved${label}; skipping to avoid an unfenced delete.`,
        );
        return;
      }

      const rawPath = input.folderPath;
      if (!isAbsolute(rawPath) || this.hasDotDotSegment(rawPath)) {
        this.logger.warn(
          `[FolderCleanup] Refusing a non-absolute or '..'-containing path${label}: ${rawPath}`,
        );
        return;
      }

      // Existence + leaf-symlink check in one. A missing folder means the *arr
      // already removed it (a clean delete) — nothing to do.
      let rawLeaf: Awaited<ReturnType<typeof lstat>>;
      try {
        rawLeaf = await lstat(rawPath);
      } catch (error) {
        if (this.isENOENT(error)) {
          this.logger.debug(
            `[FolderCleanup] Folder already gone${label}: ${rawPath}`,
          );
          return;
        }
        throw error;
      }
      if (rawLeaf.isSymbolicLink()) {
        this.logger.warn(
          `[FolderCleanup] Refusing to remove a symlinked folder${label}: ${rawPath}`,
        );
        return;
      }

      // Canonicalize (resolves any parent symlinks — common in atomic-move
      // layouts) so containment is checked against real paths.
      const candidate = this.normalize(await realpath(rawPath));
      const candidateStat = await stat(candidate);
      if (!candidateStat.isDirectory()) {
        this.logger.warn(
          `[FolderCleanup] Target is not a directory${label}: ${candidate}`,
        );
        return;
      }

      const realRoots = await this.resolveRealRoots(rawRoots);
      if (realRoots.length === 0) {
        this.logger.warn(
          `[FolderCleanup] None of the *arr root folders are visible to Maintainerr${label}; ` +
            `mount the library at the same path the *arr uses. Skipping: ${candidate}`,
        );
        return;
      }

      if (!this.isSafelyContained(candidate, realRoots, label)) {
        return;
      }

      if (
        input.scope === 'season' &&
        !(await this.isUnderParent(candidate, input.parentPath, label))
      ) {
        return;
      }

      // Master net: only remove a folder whose remaining files are all known
      // sidecars. Anything unrecognized — media, or an extension we don't know —
      // keeps the folder, so this fails safe.
      if (await this.hasNonCompanionFile(candidate)) {
        this.logger.log(
          `[FolderCleanup] Keeping ${input.scope} folder${label}: it still holds a non-sidecar file (media or unrecognized) at ${candidate}.`,
        );
        return;
      }

      await rm(candidate, { recursive: true, force: true });
      this.logger.log(
        `[FolderCleanup] Removed leftover ${input.scope} folder${label}: ${candidate}`,
      );
    } catch (error) {
      // Cleanup is best-effort; the delete already succeeded.
      this.logger.warn(
        `[FolderCleanup] Could not clean up leftover folder${label}.`,
      );
      this.logger.debug(error);
    }
  }

  /**
   * The candidate must be a proper descendant of a known root, never a root
   * itself, and never an ancestor of another root (which would wipe a nested
   * library). Uses the longest matching root.
   */
  private isSafelyContained(
    candidate: string,
    realRoots: string[],
    label: string,
  ): boolean {
    const containing = realRoots.filter(
      (root) => candidate === root || candidate.startsWith(root + sep),
    );
    if (containing.length === 0) {
      this.logger.warn(
        `[FolderCleanup] Path is not inside any known *arr root folder${label}; skipping: ${candidate}`,
      );
      return false;
    }

    const longestRoot = containing.reduce((a, b) =>
      b.length > a.length ? b : a,
    );
    if (candidate === longestRoot) {
      this.logger.warn(
        `[FolderCleanup] Refusing to remove a root folder itself${label}: ${candidate}`,
      );
      return false;
    }

    if (realRoots.some((root) => root.startsWith(candidate + sep))) {
      this.logger.warn(
        `[FolderCleanup] Refusing to remove a folder that contains a root folder${label}: ${candidate}`,
      );
      return false;
    }

    return true;
  }

  private async isUnderParent(
    candidate: string,
    parentPath: string | undefined,
    label: string,
  ): Promise<boolean> {
    if (!parentPath) {
      this.logger.debug(
        `[FolderCleanup] No series path for a season cleanup${label}; skipping.`,
      );
      return false;
    }
    let realParent: string;
    try {
      realParent = this.normalize(await realpath(parentPath));
    } catch {
      this.logger.debug(
        `[FolderCleanup] Series folder not resolvable${label}; skipping season cleanup.`,
      );
      return false;
    }
    // A true season subfolder sits strictly under the series folder. When
    // Sonarr's `seasonFolder` is off, episodes live in the series root and the
    // derived path equals the series folder — which this rejects.
    if (!candidate.startsWith(realParent + sep)) {
      this.logger.debug(
        `[FolderCleanup] Season folder is not a subfolder of the series folder${label}; skipping: ${candidate}`,
      );
      return false;
    }
    return true;
  }

  /** Canonicalize each root; drop ones not visible to Maintainerr. */
  private async resolveRealRoots(rawRoots: string[]): Promise<string[]> {
    const resolved: string[] = [];
    for (const root of rawRoots) {
      try {
        resolved.push(this.normalize(await realpath(root)));
      } catch {
        // Root not present in this container — expected when mounts differ.
      }
    }
    return resolved;
  }

  /** True if any regular file under `dir` is NOT a recognized sidecar. */
  private async hasNonCompanionFile(dir: string): Promise<boolean> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Only real directories (symlinked dirs report isSymbolicLink), so the
        // walk can't follow a link out of the tree or loop.
        if (await this.hasNonCompanionFile(join(dir, entry.name))) {
          return true;
        }
      } else if (entry.isFile() && !this.isCompanionFile(entry.name)) {
        return true;
      }
      // Symlinks are ignored: rm removes the link, not its target.
    }
    return false;
  }

  private isCompanionFile(name: string): boolean {
    const lower = name.toLowerCase();
    if (COMPANION_FILENAMES.has(lower)) {
      return true;
    }
    const dot = lower.lastIndexOf('.');
    if (dot <= 0) {
      return false; // no extension, or a dotfile — treat as non-sidecar
    }
    return COMPANION_EXTENSIONS.has(lower.slice(dot + 1));
  }

  /** Strip trailing separators (mirrors `normalizeDiskPath`, regex-free). */
  private normalize(p: string): string {
    let end = p.length;
    while (end > 1 && (p[end - 1] === '/' || p[end - 1] === '\\')) {
      end -= 1;
    }
    return end === p.length ? p : p.slice(0, end);
  }

  private hasDotDotSegment(p: string): boolean {
    let segment = '';
    for (let i = 0; i <= p.length; i++) {
      const ch = p[i];
      if (ch === undefined || ch === '/' || ch === '\\') {
        if (segment === '..') {
          return true;
        }
        segment = '';
      } else {
        segment += ch;
      }
    }
    return false;
  }

  private isENOENT(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    );
  }
}
