/**
 * Keep only rows whose Type is one of the kinds the request asked for.
 *
 * #3550: with collapseBoxSetItems=true a Movie-typed listing answers with the
 * BoxSet in place of its members (verified on Jellyfin 12.0.0; 10.11.11 and
 * Emby 4.9.5 do not collapse). Both mappers map an unknown kind to 'movie', so
 * such a row enters rule matching as deletable media with no external IDs.
 * Every listing sends collapseBoxSetItems=false; this guards them if a server
 * ignores it.
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
