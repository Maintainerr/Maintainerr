import z from 'zod'

const streamystatsUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable().optional(),
  })
  .loose()

const streamystatsItemUserStatsSchema = z.object({
  user: streamystatsUserSchema,
  watchCount: z.number(),
  totalWatchTime: z.number(),
  completionRate: z.number(),
  firstWatched: z.string().nullable(),
  lastWatched: z.string().nullable(),
})

const streamystatsItemWatchHistorySchema = z
  .object({
    user: streamystatsUserSchema.nullable(),
    watchDate: z.string(),
    watchDuration: z.number(),
    completionPercentage: z.number(),
    playMethod: z.string().nullable().optional(),
    deviceName: z.string().nullable().optional(),
    clientName: z.string().nullable().optional(),
  })
  .loose()

const streamystatsItemWatchCountByMonthSchema = z.object({
  month: z.number(),
  year: z.number(),
  watchCount: z.number(),
  uniqueUsers: z.number(),
  totalWatchTime: z.number(),
})

const streamystatsSeriesEpisodeStatsSchema = z.object({
  totalSeasons: z.number(),
  totalEpisodes: z.number(),
  watchedEpisodes: z.number(),
  watchedSeasons: z.number(),
})

export const streamystatsItemDetailsSchema = z.object({
  item: z
    .object({
      id: z.string(),
      name: z.string().nullable().optional(),
      type: z.string().nullable().optional(),
    })
    .loose(),
  totalViews: z.number(),
  totalWatchTime: z.number(),
  completionRate: z.number(),
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
