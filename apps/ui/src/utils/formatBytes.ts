const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const exponent = Math.min(
    UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  )

  const value = bytes / Math.pow(1024, exponent)
  const formatted = exponent === 0 ? value.toFixed(0) : value.toFixed(decimals)
  return `${formatted} ${UNITS[exponent]}`
}

/**
 * Compact size formatter tailored for dense card displays:
 * null/undefined → "N/A", very small non-null sizes collapse to "< 1 MB",
 * and otherwise round to the nearest GB/MB with one-decimal / integer
 * precision respectively.
 */
export const formatSizeCompact = (bytes: number | null | undefined): string => {
  if (bytes == null) return 'N/A'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(0)} MB`
  return '< 1 MB'
}

export const getPercentValue = (
  value: number,
  total: number,
  { clamp = false }: { clamp?: boolean } = {},
): number | null => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return null
  }

  const percent = (value / total) * 100
  if (!clamp) return percent

  return Math.min(Math.max(percent, 0), 100)
}

export const formatPercent = (used: number, total: number): string => {
  const percent = getPercentValue(used, total)
  if (percent === null) return '—'
  return `${percent.toFixed(1)}%`
}
