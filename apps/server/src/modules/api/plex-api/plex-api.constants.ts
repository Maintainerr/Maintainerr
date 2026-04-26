export const PLEX_PAGE_SIZE = {
  DEFAULT: 50,
  WATCHLIST: 100,
} as const;

// Bounds runtime Plex socket reads so a wedged request can't stall the rule
// executor indefinitely. Connection probes use the shorter
// CONNECTION_TEST_TIMEOUT_MS; this applies to the long-lived runtime client.
export const PLEX_REQUEST_TIMEOUT_MS = 30_000;
