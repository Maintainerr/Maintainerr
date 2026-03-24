import {
  ArrDiskspaceResource,
  DISKSPACE_REMAINING_PROPERTY,
  normalizeDiskPath,
} from '@maintainerr/contracts';
import { RuleDto } from '../dtos/rule.dto';

interface ArrDiskspaceClient {
  getDiskspace(): Promise<ArrDiskspaceResource[] | undefined>;
  getDiskspaceWithRootFolders(): Promise<ArrDiskspaceResource[] | undefined>;
}

/**
 * Filters disk space entries to only those matching the configured target path.
 * Returns all entries when no target path is configured (aggregate mode).
 */
export function filterDiskspaceByTargetPath(
  allDiskspace: ArrDiskspaceResource[],
  rule: RuleDto | undefined,
): ArrDiskspaceResource[] | null {
  const targetPath = rule?.arrDiskPath?.trim();
  const normalizedTargetPath = targetPath
    ? normalizeDiskPath(targetPath)
    : undefined;

  if (!normalizedTargetPath) {
    return allDiskspace;
  }

  return allDiskspace.filter((entry) => {
    if (!entry.path) return false;
    return normalizeDiskPath(entry.path) === normalizedTargetPath;
  });
}

/**
 * Computes remaining or total disk space in GiB from an array of disk space entries.
 */
export function computeDiskspaceGiB(
  diskspace: ArrDiskspaceResource[],
  propertyName: string,
): number | null {
  const GiB = 1073741824; // 1024^3

  if (propertyName === DISKSPACE_REMAINING_PROPERTY) {
    const totalFree = diskspace.reduce((acc, d) => acc + (d.freeSpace ?? 0), 0);
    return parseFloat((totalFree / GiB).toFixed(1));
  }

  if (diskspace.some((entry) => entry.hasAccurateTotalSpace === false)) {
    return null;
  }

  const totalSpace = diskspace.reduce((acc, d) => acc + (d.totalSpace ?? 0), 0);
  return parseFloat((totalSpace / GiB).toFixed(1));
}

export async function evaluateArrDiskspaceGiB(
  client: ArrDiskspaceClient,
  propertyName: string,
  rule: RuleDto | undefined,
  providerName: string,
  warn: (message: string) => void,
): Promise<number | null> {
  const allDiskspace =
    propertyName === DISKSPACE_REMAINING_PROPERTY
      ? await client.getDiskspaceWithRootFolders()
      : await client.getDiskspace();
  if (!allDiskspace || allDiskspace.length === 0) {
    return null;
  }

  const diskspace = filterDiskspaceByTargetPath(allDiskspace, rule);
  if (!diskspace || diskspace.length === 0) {
    warn(
      `[Diskspace] No diskspace entry matched configured path '${rule?.arrDiskPath}' in ${providerName}.`,
    );
    return null;
  }

  const diskspaceGiB = computeDiskspaceGiB(diskspace, propertyName);
  if (diskspaceGiB == null) {
    warn(
      `[Diskspace] Total disk space is unavailable for configured path '${rule?.arrDiskPath}' in ${providerName}.`,
    );
    return null;
  }

  return diskspaceGiB;
}
