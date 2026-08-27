import {
  MediaProviderIds,
  sportarrLeagueId,
  sportarrLeagueNumber,
  sportarrLeagueNumberFromTvdbAlias,
} from '@maintainerr/contracts';

// The canonical league id from the `sportarr` namespace the Sportarr media
// server agents stamp on a show (Plex `sportarr://lg-000278`, Jellyfin and
// Emby `ProviderIds.Sportarr`). Re-padded, because the connection matches it
// against Sportarr's own externalId by exact string.
function leagueExternalIdFromNativeId(
  value: string | undefined | null,
): string | undefined {
  const n = sportarrLeagueNumber(value);
  return n === undefined ? undefined : sportarrLeagueId(n);
}

// Before the agents stamped the native id they only carried a numeric alias in
// the tvdb namespace (e.g. tvdb://900000278). Libraries that were never
// refreshed since still resolve through it.
export function sportarrLeagueExternalIdFromTvdbAlias(
  tvdbAlias: number | undefined | null,
): string | undefined {
  const n = sportarrLeagueNumberFromTvdbAlias(tvdbAlias);
  return n === undefined ? undefined : sportarrLeagueId(n);
}

// Resolve the league from everything a media-server item carries. The native
// `sportarr` id wins; the tvdb alias is the fallback for a show that predates
// it. A media-server item can carry several tvdb guids (e.g. a real TVDB id
// from an agent match alongside the alias), in no guaranteed order, so scan
// them all for the one inside the reserved range instead of trusting the
// first entry.
export function sportarrLeagueExternalIdFromProviderIds(
  providerIds: MediaProviderIds | undefined | null,
): string | undefined {
  for (const candidate of providerIds?.sportarr ?? []) {
    const externalId = leagueExternalIdFromNativeId(candidate);
    if (externalId) {
      return externalId;
    }
  }
  for (const candidate of providerIds?.tvdb ?? []) {
    const externalId = sportarrLeagueExternalIdFromTvdbAlias(Number(candidate));
    if (externalId) {
      return externalId;
    }
  }
  return undefined;
}
