import type { MediaItemType } from '../media-server/enums'

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

/**
 * The scope a collection's overlays use. Only a show collection has one: a
 * season or episode collection's own members already sit below the show.
 * Anything else, and any value that is not a scope, reads as the default, so
 * a value left behind by a change of media type cannot trim overlays unseen.
 */
export const resolveOverlayScope = (
  type: MediaItemType | undefined,
  scope: string | null | undefined,
): OverlayScope => {
  const known = overlayScopeValues.find((value) => value === scope)
  return type === 'show' && known ? known : DEFAULT_OVERLAY_SCOPE
}
