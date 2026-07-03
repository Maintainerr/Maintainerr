import z from 'zod'

// A Streamystats "watchlist" is a user-created, named curated list of media
// items with its own visibility flags - NOT a Plex-style personal "want to
// watch" queue. Maintainerr authenticates to Streamystats with a Jellyfin
// server API key, which Streamystats resolves to its "system-api-key"
// pseudo-user; the watchlist endpoints therefore only ever surface PUBLIC
// lists (those a user shared) plus that pseudo-user's own (none). Private
// lists are intentionally invisible.
//
// These schemas validate only the fields Maintainerr consumes; `.loose()`
// tolerates the other fields Streamystats returns.

const streamystatsWatchlistSummarySchema = z
  .object({
    // `id` is a serial primary key; coerce defensively in case the wire
    // format serialises it as a string (see itemDetails for prior art).
    id: z.coerce.number(),
    // Jellyfin user ID of the list owner.
    userId: z.string(),
    // Optional: used only to make skip/diagnostic logs readable. Kept lenient
    // so an absent/odd name never fails validation and drops the list.
    name: z.string().nullish(),
  })
  .loose()

export const streamystatsWatchlistsResponseSchema = z.object({
  data: z.array(streamystatsWatchlistSummarySchema),
})

// `?format=ids` response; we only need the Jellyfin item IDs in the list.
export const streamystatsWatchlistItemIdsResponseSchema = z.object({
  data: z.object({
    items: z.array(z.string()),
  }),
})
