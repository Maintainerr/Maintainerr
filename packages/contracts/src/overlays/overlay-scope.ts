// ── Overlay scope ─────────────────────────────────────────────────────────

/**
 * How far below a show its countdown overlay reaches: the show's poster, its
 * season posters as well, or every episode title card too. Seasons and
 * episodes are drawn on because they leave with the show, not because they
 * are members, so the scope only trims what is inherited.
 */
export const overlayScopeValues = ['show_only', 'show_seasons', 'all'] as const
export type OverlayScope = (typeof overlayScopeValues)[number]

/** Every level: how overlays behaved before the scope existed. */
export const DEFAULT_OVERLAY_SCOPE: OverlayScope = 'all'
