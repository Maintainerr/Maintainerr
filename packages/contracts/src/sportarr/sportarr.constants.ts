// Sportarr-specific constants, shared by the server connection and the UI.

// Sportarr stamps numeric aliases in the tvdb provider-id namespace on its
// media-server items (tvdb://900000278 for league lg-000278). The offset is a
// frozen part of Sportarr's published id contract; league aliases live
// strictly inside (OFFSET, OFFSET + RANGE).
export const SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET = 900_000_000

// Width of the reserved league alias window.
export const SPORTARR_TVDB_ALIAS_RANGE = 100_000_000

// The Sportarr release that ships the id-alias emission and the
// download-history surface the native connection calls; the connection test
// refuses older instances.
export const MINIMUM_SPORTARR_VERSION = '4.0.1022'
