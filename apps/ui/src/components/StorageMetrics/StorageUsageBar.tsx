import {
  formatBytes,
  formatPercent,
  getPercentValue,
} from '../../utils/formatBytes'

interface StorageUsageBarProps {
  used: number
  total: number
  free: number
  accurateTotalSpace: boolean
}

const StorageUsageBar: React.FC<StorageUsageBarProps> = ({
  used,
  total,
  free,
  accurateTotalSpace,
}) => {
  const percent = getPercentValue(used, total, { clamp: true }) ?? 0
  const barColor =
    percent >= 90
      ? 'bg-error-500'
      : percent >= 75
        ? 'bg-maintainerr-500'
        : 'bg-maintainerrdark-500'

  return (
    <div>
      <div className="flex items-end justify-between text-xs text-zinc-300">
        <span>
          {formatBytes(used)} used
          {accurateTotalSpace && total > 0 ? ` of ${formatBytes(total)}` : ''}
        </span>
        <span className="text-zinc-400">
          {accurateTotalSpace
            ? formatPercent(used, total)
            : `${formatBytes(free)} free`}
        </span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded bg-zinc-700"
        role="progressbar"
        aria-valuenow={accurateTotalSpace ? Math.round(percent) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full ${barColor} transition-all`}
          style={{
            width: accurateTotalSpace ? `${Math.max(percent, 2)}%` : '0%',
          }}
        />
      </div>
      {!accurateTotalSpace ? (
        <p className="mt-1 text-[11px] text-zinc-500">
          Total size not reported by this instance — only free space is
          accurate.
        </p>
      ) : null}
    </div>
  )
}

export default StorageUsageBar
