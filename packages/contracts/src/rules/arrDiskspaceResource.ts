export interface ArrDiskspaceResource {
  id: number
  path: string | null
  label: string | null
  freeSpace: number
  totalSpace: number
  /**
   * False when the entry was synthesized from a root-folder response that does
   * not expose a trustworthy total-space value.
   */
  hasAccurateTotalSpace?: boolean
}

export const normalizeDiskPath = (path: string): string => {
  return path.length <= 1 ? path : path.replace(/[\\/]+$/, '')
}
