import { Trans } from '@lingui/react/macro'
import type { StreamystatsItemDetails } from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import GetApiHandler from '../../../../../utils/ApiHandler'
import BrandLink from '../../../BrandLink'
import { SmallLoadingSpinner } from '../../../LoadingSpinner'

interface StreamystatsStatsPanelProps {
  itemId: string
  itemUrl: string
}

type FetchState =
  | { status: 'loading' }
  | { status: 'ready'; data: StreamystatsItemDetails }
  | { status: 'empty' }
  | { status: 'error' }

const formatDate = (value: string | null | undefined): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString()
}

const formatWatchTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0m'
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

const StreamystatsStatsPanel = ({
  itemId,
  itemUrl,
}: StreamystatsStatsPanelProps) => {
  const [state, setState] = useState<FetchState>({ status: 'loading' })

  useEffect(() => {
    let active = true

    GetApiHandler<StreamystatsItemDetails>(`/streamystats/items/${itemId}`)
      .then((data) => {
        if (!active) return
        if (!data) {
          setState({ status: 'empty' })
          return
        }
        setState({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (
          error instanceof Error &&
          /404|not found|no streamystats data/i.test(error.message)
        ) {
          setState({ status: 'empty' })
          return
        }
        setState({ status: 'error' })
      })

    return () => {
      active = false
    }
  }, [itemId])

  // Named locals so the counts reach the catalog as readable placeholders.
  const episodeStats = state.status === 'ready' ? state.data.episodeStats : null
  const watchedEpisodes = episodeStats?.watchedEpisodes
  const totalEpisodes = episodeStats?.totalEpisodes
  const watchedSeasons = episodeStats?.watchedSeasons
  const totalSeasons = episodeStats?.totalSeasons

  return (
    <div className="mt-4 min-h-30 rounded-xl bg-zinc-900/70 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Streamystats</p>
        <BrandLink external href={itemUrl} className="text-xs no-underline">
          <Trans>View on Streamystats</Trans> &rarr;
        </BrandLink>
      </div>

      {state.status === 'loading' ? (
        <div className="mt-3 flex h-16 items-center">
          <SmallLoadingSpinner className="h-6 w-6" />
        </div>
      ) : state.status === 'error' ? (
        <p className="mt-2 text-sm text-error-400">
          <Trans>Failed to load Streamystats data</Trans>
        </p>
      ) : state.status === 'empty' ? (
        <p className="mt-2 text-sm text-zinc-100/80">
          <Trans>No watch history recorded yet.</Trans>
        </p>
      ) : (
        <div className="mt-2 space-y-3 text-sm text-zinc-100">
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs tracking-wide text-zinc-100/60 uppercase">
                <Trans>Plays</Trans>
              </dt>
              <dd className="font-medium">{state.data.totalViews}</dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-zinc-100/60 uppercase">
                <Trans>Completion</Trans>
              </dt>
              <dd className="font-medium">
                {Math.round(state.data.completionRate)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs tracking-wide text-zinc-100/60 uppercase">
                <Trans>Last watched</Trans>
              </dt>
              <dd className="font-medium">
                {formatDate(state.data.lastWatched)}
              </dd>
            </div>
          </dl>

          {episodeStats ? (
            <p className="text-xs text-zinc-100/60">
              <Trans>
                {watchedEpisodes}/{totalEpisodes} episodes watched
              </Trans>{' '}
              &middot;{' '}
              <Trans>
                {watchedSeasons}/{totalSeasons} seasons complete
              </Trans>
            </p>
          ) : null}

          {state.data.usersWatched.length > 0 ? (
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
                    <th className="px-2 py-1 text-right font-medium">
                      <Trans>Last watched</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.usersWatched.slice(0, 5).map((row) => (
                    <tr
                      key={row.user.id}
                      className="border-t border-zinc-700/50"
                    >
                      <td className="px-2 py-1 text-zinc-100">
                        {row.user.name ?? row.user.id}
                      </td>
                      <td className="px-2 py-1 text-right">{row.watchCount}</td>
                      <td className="px-2 py-1 text-right">
                        {formatWatchTime(row.totalWatchTime)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {formatDate(row.lastWatched)}
                      </td>
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

export default StreamystatsStatsPanel
