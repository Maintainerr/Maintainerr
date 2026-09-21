import { Trans } from '@lingui/react/macro'
import type { StreamystatsItemDetails } from '@maintainerr/contracts'
import WatchStatsPanel, { type WatchStatsView } from '../WatchStatsPanel'

interface StreamystatsStatsPanelProps {
  itemId: string
  itemUrl: string
}

const toView = (data: StreamystatsItemDetails): WatchStatsView => {
  // Named locals so the counts reach the catalog as readable placeholders.
  const watchedEpisodes = data.episodeStats?.watchedEpisodes
  const totalEpisodes = data.episodeStats?.totalEpisodes
  const watchedSeasons = data.episodeStats?.watchedSeasons
  const totalSeasons = data.episodeStats?.totalSeasons

  return {
    plays: data.totalViews,
    completion: data.completionRate,
    lastWatched: data.lastWatched,
    note: data.episodeStats ? (
      <p className="text-xs text-zinc-100/60">
        <Trans>
          {watchedEpisodes}/{totalEpisodes} episodes watched
        </Trans>{' '}
        &middot;{' '}
        <Trans>
          {watchedSeasons}/{totalSeasons} seasons complete
        </Trans>
      </p>
    ) : undefined,
    users: data.usersWatched.map((row) => ({
      name: row.user.name ?? row.user.id,
      plays: row.watchCount,
      watchTime: row.totalWatchTime,
      lastWatched: row.lastWatched,
    })),
  }
}

const StreamystatsStatsPanel = ({
  itemId,
  itemUrl,
}: StreamystatsStatsPanelProps) => (
  <WatchStatsPanel
    name="Streamystats"
    path={`/streamystats/items/${itemId}`}
    url={itemUrl}
    toView={toView}
  />
)

export default StreamystatsStatsPanel
