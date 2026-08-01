import {
  LeftoverCleanupScope,
  normalizeDiskPath,
} from '@maintainerr/contracts';
import { Injectable } from '@nestjs/common';
import { lstat, readdir, realpath, rmdir, stat, unlink } from 'fs/promises';
import { isAbsolute, join, sep } from 'path';
import { MaintainerrLogger } from '../logging/logs.service';

/**
 * The master safety gate is an allowlist, not a media denylist, on purpose: a
 * destructive delete must fail safe. Only a plain file whose extension is a
 * recognized sidecar may be removed; anything else - a media file, an unknown
 * extension, a symlink, a socket - keeps the whole folder. A missing entry here
 * therefore only ever leaves a folder uncleaned, never deletes real data.
 * Matched on the lower-cased extension.
 *
 * Kept deliberately narrow: generic extensions (txt, log, md, ...) carry no
 * *arr-sidecar signal and would only widen the blast radius.
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
  // metadata sidecars written by the *arrs and media servers
  'nfo',
  'xml',
  'json',
  // artwork
  'jpg',
  'jpeg',
  'png',
  'webp',
  'tbn',
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
  /** The *arr `/rootfolder` paths - the only places a delete may touch. */
  rootFolderPaths: string[];
  /**
   * Paths of the files the *arr just deleted, in the *arr's namespace. The
   * folder must have held at least one of them, which is what proves this is
   * the folder that was emptied and not a same-named directory from an
   * unrelated mount.
   */
  deletedFilePaths: string[];
  /**
   * Folders of the *arr's other tracked items. Never remove a folder at or
   * above one, mirroring the abstention in the *arr's own delete handler.
   */
  otherItemPaths?: string[];
  scope: LeftoverCleanupScope;
  /** Series folder; required for `season` scope to prove a real subfolder. */
  parentPath?: string;
  /** Title, for log lines only. */
  label?: string;
}

/**
 * Removes the folder left behind when an *arr deletes an item's files one file
 * at a time (`DELETE /moviefile/{id}`, `DELETE /episodefile/{id}`), which strands
 * the folder and its sidecars. Whole-entity deletes are deliberately not cleaned:
 * those remove the folder in the *arr itself. Opt-in per collection via
 * `cleanupLeftoverFolders` and off by default; which actions can offer it is
 * decided by `leftoverCleanupScope` in @maintainerr/contracts.
 *
 * Best-effort, like {@link DownloadClientApiService.removeDownloads}: the media
 * is already gone by the time this runs, so it must never throw into the caller.
 * Every gate is fail-closed - on any doubt the folder is left untouched. It
 * assumes the library is mounted into Maintainerr at the same path the *arr
 * reports; when it isn't, the guardrails no-op and say so.
 */
@Injectable()
export class LeftoverFolderCleanupService {
  constructor(private readonly logger: MaintainerrLogger) {
    logger.setContext(LeftoverFolderCleanupService.name);
  }

  /**
   * The media-server delete fallback runs when the *arr does not track the item,
   * which is also where every fence comes from - so this cleanup cannot run
   * there. It is not needed there either: Jellyfin and Emby delete the item's
   * own folder along with it, so nothing is stranded to clean up. Report it as
   * "does not apply" rather than a skipped cleanup, and keep the per-server
   * detail in the docs instead of naming servers here (#3370).
   */
  public logNotApplicableForUntrackedItem(label?: string): void {
    this.logger.log(
      `Leftover-folder cleanup does not apply${label ? ` to '${label}'` : ''}: the item is not tracked in the *arr, so the media server deleted it directly - see https://docs.maintainerr.info/collections/.`,
    );
  }

  public async cleanupAfterDelete(input: LeftoverCleanupInput): Promise<void> {
    const label = input.label ? ` for '${input.label}'` : '';
    try {
      // No known root means no fence - the classic empty-`$VAR` `rm -rf` trap.
      const rawRoots = input.rootFolderPaths.filter((p) => p.trim().length > 0);
      if (rawRoots.length === 0) {
        this.logger.warn(
          `No *arr root folders resolved${label}; skipping to avoid an unfenced delete.`,
        );
        return;
      }

      // Resolved before the folder itself: an unmounted library fails both
      // checks, and this is the one that tells the user why.
      const realRoots = await this.resolveRealRoots(rawRoots, label);
      if (realRoots === undefined) {
        return;
      }
      if (realRoots.length === 0) {
        this.logger.warn(
          `None of the *arr root folders are visible to Maintainerr${label}; ` +
            `mount the library at the same path the *arr uses. Skipping.`,
        );
        return;
      }

      const rawPath = input.folderPath;
      if (!rawPath) {
        this.logger.debug(`No folder path available${label}; skipping.`);
        return;
      }
      if (!isAbsolute(rawPath) || this.hasDotDotSegment(rawPath)) {
        this.logger.warn(
          `Refusing a non-absolute or '..'-containing path${label}: ${rawPath}`,
        );
        return;
      }

      // Namespace checks run on the *arr's own strings, before canonicalization,
      // because that is the namespace the *arr reported them in.
      const rawFolder = normalizeDiskPath(rawPath);
      if (!this.heldADeletedFile(rawFolder, input.deletedFilePaths)) {
        this.logger.debug(
          `None of the deleted files were inside ${rawFolder}${label}; skipping.`,
        );
        return;
      }
      if (!this.isClearOfOtherItems(rawFolder, input.otherItemPaths, label)) {
        return;
      }

      // Existence + leaf-symlink check in one. A missing folder means the *arr
      // already removed it (a clean delete) - nothing to do. Stat the
      // normalized path, not the raw one: lstat resolves a trailing separator,
      // so `lstat('link/')` reports the target and would slip a symlinked
      // folder past this gate.
      let rawLeaf: Awaited<ReturnType<typeof lstat>>;
      try {
        rawLeaf = await lstat(rawFolder);
      } catch (error) {
        if (this.isENOENT(error)) {
          this.logger.debug(`Folder already gone${label}: ${rawFolder}`);
          return;
        }
        throw error;
      }
      if (rawLeaf.isSymbolicLink()) {
        this.logger.warn(
          `Refusing to remove a symlinked folder${label}: ${rawFolder}`,
        );
        return;
      }

      // Canonicalize (resolves any parent symlinks - common in atomic-move
      // layouts) so containment is checked against real paths.
      const candidate = normalizeDiskPath(await realpath(rawFolder));
      const candidateStat = await stat(candidate);
      if (!candidateStat.isDirectory()) {
        this.logger.warn(`Target is not a directory${label}: ${candidate}`);
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

      // Master net: collect every file to remove and abort on anything that is
      // not a plain sidecar. Only the collected paths are deleted, so a file
      // that appears after this walk is never removed unseen.
      const companions = await this.collectCompanionFiles(candidate);
      if (companions === undefined) {
        this.logger.log(
          `Keeping ${input.scope} folder${label}: it still holds a non-sidecar entry (media, an unrecognized extension or a link) at ${candidate}.`,
        );
        return;
      }

      await this.removeVerified(candidate, companions);
      this.logger.log(
        `Removed leftover ${input.scope} folder${label} and ${companions.length} sidecar file(s): ${candidate}`,
      );
    } catch (error) {
      // Cleanup is best-effort; the delete already succeeded.
      this.logger.warn(
        `Could not clean up leftover folder${label} (${input.folderPath}): ${error}`,
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
        `Path is not inside any known *arr root folder${label}; skipping: ${candidate}`,
      );
      return false;
    }

    const longestRoot = containing.reduce((a, b) =>
      b.length > a.length ? b : a,
    );
    if (candidate === longestRoot) {
      this.logger.warn(
        `Refusing to remove a root folder itself${label}: ${candidate}`,
      );
      return false;
    }

    if (realRoots.some((root) => root.startsWith(candidate + sep))) {
      this.logger.warn(
        `Refusing to remove a folder that contains a root folder${label}: ${candidate}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Radarr and Sonarr refuse to delete an item's files when its folder is at or
   * above another tracked item's folder; this keeps Maintainerr from acting
   * where they deliberately abstain.
   */
  private isClearOfOtherItems(
    rawFolder: string,
    otherItemPaths: string[] | undefined,
    label: string,
  ): boolean {
    const clashing = (otherItemPaths ?? [])
      .map((p) => normalizeDiskPath(p))
      .find(
        (other) => other === rawFolder || other.startsWith(rawFolder + sep),
      );
    if (clashing !== undefined) {
      this.logger.warn(
        `Refusing to remove a folder shared with another tracked item${label}: ${rawFolder} holds ${clashing}`,
      );
      return false;
    }
    return true;
  }

  /** True when one of the just-deleted files lived inside this folder. */
  private heldADeletedFile(
    rawFolder: string,
    deletedFilePaths: string[],
  ): boolean {
    return deletedFilePaths.some((file) =>
      normalizeDiskPath(file).startsWith(rawFolder + sep),
    );
  }

  private async isUnderParent(
    candidate: string,
    parentPath: string | undefined,
    label: string,
  ): Promise<boolean> {
    if (!parentPath) {
      this.logger.debug(
        `No series path for a season cleanup${label}; skipping.`,
      );
      return false;
    }
    let realParent: string;
    try {
      realParent = normalizeDiskPath(await realpath(parentPath));
    } catch {
      this.logger.debug(
        `Series folder not resolvable${label}; skipping season cleanup.`,
      );
      return false;
    }
    // A true season subfolder sits strictly under the series folder. When
    // Sonarr's `seasonFolder` is off, episodes live in the series root and the
    // derived path equals the series folder - which this rejects.
    if (!candidate.startsWith(realParent + sep)) {
      this.logger.debug(
        `Season folder is not a subfolder of the series folder${label}; skipping: ${candidate}`,
      );
      return false;
    }
    return true;
  }

  /**
   * Canonicalize each root, dropping ones this container cannot see. Returns
   * undefined when a root exists but cannot be read: a root is a safety input,
   * so an unreadable one aborts rather than silently shrinking the fence.
   */
  private async resolveRealRoots(
    rawRoots: string[],
    label: string,
  ): Promise<string[] | undefined> {
    const resolved: string[] = [];
    for (const root of rawRoots) {
      try {
        resolved.push(normalizeDiskPath(await realpath(root)));
      } catch (error) {
        if (!this.isENOENT(error)) {
          this.logger.warn(
            `*arr root folder ${root} could not be read${label}; skipping to keep the fence intact.`,
          );
          this.logger.debug(error);
          return undefined;
        }
        // Not present in this container - expected when mounts differ.
      }
    }
    return resolved;
  }

  /**
   * Every file under `dir`, or undefined when the folder must be kept. Anything
   * that is not a plain directory or a plain sidecar file aborts the walk -
   * notably symlinks, which `readdir` reports as neither a file nor a directory
   * and which a recursive remove would silently unlink.
   */
  private async collectCompanionFiles(
    dir: string,
  ): Promise<string[] | undefined> {
    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await this.collectCompanionFiles(full);
        if (nested === undefined) {
          return undefined;
        }
        files.push(...nested);
      } else if (entry.isFile() && this.isCompanionFile(entry.name)) {
        files.push(full);
      } else {
        return undefined;
      }
    }
    return files;
  }

  /**
   * Removes exactly the verified files, then the now-empty directories from the
   * inside out. `rmdir` is non-recursive on purpose: if anything appeared since
   * the walk (an *arr import racing us) it fails with ENOTEMPTY and the folder
   * survives, rather than a recursive remove taking a file nothing classified.
   */
  private async removeVerified(dir: string, files: string[]): Promise<void> {
    for (const file of files) {
      await unlink(file);
    }
    await this.removeEmptyTree(dir);
  }

  private async removeEmptyTree(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.removeEmptyTree(join(dir, entry.name));
      }
    }
    await rmdir(dir);
  }

  private isCompanionFile(name: string): boolean {
    const lower = name.toLowerCase();
    if (COMPANION_FILENAMES.has(lower)) {
      return true;
    }
    const dot = lower.lastIndexOf('.');
    if (dot <= 0) {
      return false; // no extension, or a dotfile - treat as non-sidecar
    }
    return COMPANION_EXTENSIONS.has(lower.slice(dot + 1));
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
