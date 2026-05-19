import z from 'zod'

// Streamystats's getItemDetails surfaces aggregation results (COUNT/SUM/AVG)
// straight from Drizzle, which serialises them as strings even though the
// upstream TypeScript interface declares them as `number`. Coerce defensively
// so the schema stays robust to that wire-format quirk.
const numberLike = z.coerce.number()

const streamystatsUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
  })
  .loose()

const streamystatsItemUserStatsSchema = z.object({
  user: streamystatsUserSchema,
  watchCount: numberLike,
  totalWatchTime: numberLike,
  completionRate: numberLike,
  firstWatched: z.string().nullable(),
  lastWatched: z.string().nullable(),
})

const streamystatsItemWatchHistorySchema = z
  .object({
    user: streamystatsUserSchema.nullable(),
    watchDate: z.string(),
    watchDuration: numberLike,
    completionPercentage: numberLike,
    playMethod: z.string().nullable().optional(),
    deviceName: z.string().nullable().optional(),
    clientName: z.string().nullable().optional(),
  })
  .loose()

const streamystatsItemWatchCountByMonthSchema = z.object({
  month: numberLike,
  year: numberLike,
  watchCount: numberLike,
  uniqueUsers: numberLike,
  totalWatchTime: numberLike,
})

const streamystatsSeriesEpisodeStatsSchema = z.object({
  totalSeasons: numberLike,
  totalEpisodes: numberLike,
  watchedEpisodes: numberLike,
  watchedSeasons: numberLike,
})

export const streamystatsItemDetailsSchema = z.object({
  item: z
    .object({
      id: z.string(),
      name: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
    })
    .loose(),
  totalViews: numberLike,
  totalWatchTime: numberLike,
  completionRate: numberLike,
  firstWatched: z.string().nullable(),
  lastWatched: z.string().nullable(),
  usersWatched: z.array(streamystatsItemUserStatsSchema),
  watchHistory: z.array(streamystatsItemWatchHistorySchema),
  watchCountByMonth: z.array(streamystatsItemWatchCountByMonthSchema),
  episodeStats: streamystatsSeriesEpisodeStatsSchema.optional(),
})

export type StreamystatsItemDetails = z.infer<
  typeof streamystatsItemDetailsSchema
>
export type StreamystatsItemUserStats = z.infer<
  typeof streamystatsItemUserStatsSchema
>
export type StreamystatsItemWatchCountByMonth = z.infer<
  typeof streamystatsItemWatchCountByMonthSchema
>
export type StreamystatsSeriesEpisodeStats = z.infer<
  typeof streamystatsSeriesEpisodeStatsSchema
>
