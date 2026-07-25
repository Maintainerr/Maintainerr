// Sportarr stamps a numeric alias in the tvdb namespace onto its Plex items
// (e.g. tvdb://900000278), alongside the native sportarr:// guid. Maintainerr's
// Plex mapper already extracts the tvdb guid into providerIds.tvdb, so the
// connection reverses that alias back to the canonical league external id
// (lg-000278) instead of touching the shared guid-parsing layer. The offset is
// a frozen part of Sportarr's published id contract (docs/EXTERNAL_IDS.md).
export const SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET = 900_000_000;

export function sportarrLeagueExternalIdFromTvdbAlias(
  tvdbAlias: number | undefined | null,
): string | null {
  if (
    tvdbAlias === undefined ||
    tvdbAlias === null ||
    !Number.isInteger(tvdbAlias)
  ) {
    return null;
  }

  const n = tvdbAlias - SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET;
  // Values outside the reserved league alias range (900,000,000-999,999,999)
  // are not Sportarr league ids.
  if (n <= 0 || n >= 100_000_000) {
    return null;
  }

  return `lg-${n.toString().padStart(6, '0')}`;
}

// A media-server item can carry several tvdb guids (e.g. a real TVDB id from
// an agent match alongside the Sportarr alias), in no guaranteed order. Scan
// them all for the one inside the reserved alias range instead of trusting
// the first entry.
export function sportarrLeagueExternalIdFromProviderIds(
  tvdbIds: readonly string[] | undefined | null,
): string | null {
  for (const candidate of tvdbIds ?? []) {
    const externalId = sportarrLeagueExternalIdFromTvdbAlias(Number(candidate));
    if (externalId) {
      return externalId;
    }
  }
  return null;
}
