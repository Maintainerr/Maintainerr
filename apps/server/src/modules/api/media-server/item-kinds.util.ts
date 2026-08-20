/**
 * Keep only rows whose Type is one of the kinds the request asked for.
 *
 * #3550: a Jellyfin library that groups films into collections answers a
 * Movie-typed listing with BoxSet rows, and both mappers map an unknown kind to
 * 'movie', so such a row enters rule matching as deletable media with no
 * external IDs. Verified on 10.11.11 with grouping enabled (a Movie listing
 * came back as BoxSets only) and on 12.0.0, which collapses on the query
 * parameter alone.
 *
 * Every listing sends collapseBoxSetItems=false, which Jellyfin honours ahead
 * of its own grouping setting on both versions, so this guards the listings if
 * a server ignores it.
 *
 * Takes the Jellyfin SDK's BaseItemKind[] or Emby's IncludeItemTypes string, so
 * call sites pass the value they queried with.
 */
export const onlyRequestedItemKinds = <T extends { Type?: string | null }>(
  items: T[] | null | undefined,
  kinds: string | readonly string[],
): T[] => {
  const allowed = typeof kinds === 'string' ? kinds.split(',') : kinds;
  return (items ?? []).filter(
    (item) => !!item.Type && allowed.includes(item.Type),
  );
};
