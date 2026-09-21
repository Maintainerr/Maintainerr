import { Trans, useLingui } from '@lingui/react/macro'
import type { MediaWatchStats } from '@maintainerr/contracts'
import type { ReactNode } from 'react'
import { useWatchStats } from '../../../../../api/watchStats'
import BrandLink from '../../../BrandLink'
import { SmallLoadingSpinner } from '../../../LoadingSpinner'

export interface WatchStatsView extends Omit<MediaWatchStats, 'watchTime'> {
  /** Percent. Shown in place of the total watch time when a service has it. */
  completion?: number
  watchTime?: number
  note?: ReactNode
}

interface WatchStatsPanelProps<T> {
  /** The service's name: a brand, so never translated. */
  name: string
  path: string
  /** For a service whose item link is known without its statistics. */
  url?: string
  toView: (data: T) => WatchStatsView
}

// The app locale, not the browser's - the labels beside these dates follow
// the language picker, so the date format has to follow it too.
const formatDate = (value: string | null, locale: string): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString(locale)
}

const formatWatchTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0m'
  if (seconds < 60) return '<1m'
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

const termClassName = 'text-xs tracking-wide text-zinc-100/60 uppercase'

const WatchStatsPanel = <T,>({
  name,
  path,
  url,
  toView,
}: WatchStatsPanelProps<T>) => {
  const { i18n, t } = useLingui()
  const { data, isPending, isError } = useWatchStats<T>(path)
  const view = data ? toView(data) : undefined
  const href = url ?? view?.url
  const hasUserDates = view?.users.some((user) => user.lastWatched) ?? false

  return (
    <div className="mt-4 min-h-30 rounded-xl bg-zinc-900/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">{name}</p>
        {href ? (
          <BrandLink external href={href} className="text-xs no-underline">
            {t`Open on ${{ provider: name }}`} &rarr;
          </BrandLink>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-3 flex h-16 items-center">
          <SmallLoadingSpinner className="h-6 w-6" />
        </div>
      ) : isError ? (
        <p className="mt-2 text-sm text-error-400">
          <Trans>Failed to load {name} data</Trans>
        </p>
      ) : !view ? (
        <p className="mt-2 text-sm text-zinc-100/80">
          <Trans>No watch history recorded yet.</Trans>
        </p>
      ) : (
        <div className="mt-2 space-y-3 text-sm text-zinc-100">
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className={termClassName}>
                <Trans>Plays</Trans>
              </dt>
              <dd className="font-medium">{view.plays}</dd>
            </div>
            {view.completion != null ? (
              <div>
                <dt className={termClassName}>
                  <Trans>Completion</Trans>
                </dt>
                <dd className="font-medium">{Math.round(view.completion)}%</dd>
              </div>
            ) : (
              <div>
                <dt className={termClassName}>
                  <Trans>Watch time</Trans>
                </dt>
                <dd className="font-medium">
                  {formatWatchTime(view.watchTime ?? 0)}
                </dd>
              </div>
            )}
            <div>
              <dt className={termClassName}>
                <Trans>Last watched</Trans>
              </dt>
              <dd className="font-medium">
                {formatDate(view.lastWatched, i18n.locale)}
              </dd>
            </div>
          </dl>

          {view.note}

          {view.users.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-zinc-700/50">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-800/60 text-zinc-100">
                  <tr>
                    <th className="px-2 py-1 font-medium">
                      <Trans>User</Trans>
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      <Trans>Plays</Trans>
                    </th>
                    <th className="px-2 py-1 text-right font-medium">
                      <Trans>Watch time</Trans>
                    </th>
                    {hasUserDates ? (
                      <th className="px-2 py-1 text-right font-medium">
                        <Trans>Last watched</Trans>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {view.users.slice(0, 5).map((user, index) => (
                    <tr key={index} className="border-t border-zinc-700/50">
                      <td className="px-2 py-1 text-zinc-100">{user.name}</td>
                      <td className="px-2 py-1 text-right">{user.plays}</td>
                      <td className="px-2 py-1 text-right">
                        {formatWatchTime(user.watchTime)}
                      </td>
                      {hasUserDates ? (
                        <td className="px-2 py-1 text-right">
                          {formatDate(user.lastWatched, i18n.locale)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default WatchStatsPanel
