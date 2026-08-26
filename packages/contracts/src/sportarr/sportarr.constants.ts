// Sportarr-specific constants and the id predicate they define, shared by the
// server connection and the UI.

// Sportarr stamps numeric aliases in the tvdb provider-id namespace on its
// media-server items (tvdb://900000278 for league lg-000278). The offset is a
// frozen part of Sportarr's published id contract; league aliases live
// strictly inside (OFFSET, OFFSET + RANGE).
export const SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET = 900_000_000

// Width of the reserved league alias window.
export const SPORTARR_TVDB_ALIAS_RANGE = 100_000_000

/**
 * True when a tvdb-namespace value falls inside Sportarr's reserved window.
 * Nothing in the window is a TVDB id, so the UI never links one out and the
 * connection reverses it to a league id instead. Single source of truth for
 * the window, so the two cannot drift apart.
 */
export function isSportarrTvdbAlias(
  tvdbId: number | undefined | null,
): tvdbId is number {
  return (
    tvdbId != null &&
    Number.isInteger(tvdbId) &&
    tvdbId >= SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET &&
    tvdbId < SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET + SPORTARR_TVDB_ALIAS_RANGE
  )
}

// The Sportarr release that ships the id-alias emission and the
// download-history surface the native connection calls; the connection test
// refuses older instances.
export const MINIMUM_SPORTARR_VERSION = '4.0.1022'

const LEAGUE_ID_PREFIX = 'lg-'
const LEAGUE_ID_PAD = 6

/**
 * The league number inside a Sportarr league id (lg-000278 -> 278), which is
 * how the metadata layer keys the id. Event ids (ev-...) live on episodes and
 * never identify a league, so only the `lg-` prefix parses.
 */
export function sportarrLeagueNumber(
  value: string | undefined | null,
): number | undefined {
  const id = value?.trim().toLowerCase()
  if (!id?.startsWith(LEAGUE_ID_PREFIX)) {
    return undefined
  }
  const digits = id.slice(LEAGUE_ID_PREFIX.length)
  if (!digits.length) {
    return undefined
  }
  for (let i = 0; i < digits.length; i++) {
    const code = digits.charCodeAt(i)
    if (code < 48 || code > 57) {
      return undefined
    }
  }
  const n = Number(digits)
  return Number.isSafeInteger(n) && n > 0 ? n : undefined
}

/** The league id for its number (278 -> lg-000278). Ids past the pad width stay unpadded. */
export function sportarrLeagueId(n: number): string {
  return `${LEAGUE_ID_PREFIX}${String(n).padStart(LEAGUE_ID_PAD, '0')}`
}

/** The league number a tvdb alias encodes (900000278 -> 278), or undefined outside the window. */
export function sportarrLeagueNumberFromTvdbAlias(
  tvdbId: number | undefined | null,
): number | undefined {
  if (!isSportarrTvdbAlias(tvdbId)) {
    return undefined
  }
  // The offset itself is the bottom of the window, not league 0.
  const n = tvdbId - SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET
  return n > 0 ? n : undefined
}
