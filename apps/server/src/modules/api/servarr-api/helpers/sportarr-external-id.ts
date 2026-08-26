import {
  MediaProviderIds,
  SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET,
  SPORTARR_TVDB_ALIAS_RANGE,
} from '@maintainerr/contracts';

const LEAGUE_ID_PREFIX = 'lg-';
const LEAGUE_ID_PAD = 6;

// A Sportarr league id as its agents stamp it: `lg-` and at least one digit.
// Event ids (`ev-...`) live on episodes and never identify a league.
function isLeagueId(value: string): boolean {
  if (
    !value.startsWith(LEAGUE_ID_PREFIX) ||
    value.length === LEAGUE_ID_PREFIX.length
  ) {
    return false;
  }
  for (let i = LEAGUE_ID_PREFIX.length; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

// The canonical league id from the `sportarr` namespace the Sportarr media
// server agents stamp on a show (Plex `sportarr://lg-000278`, Jellyfin and
// Emby `ProviderIds.Sportarr`). Anything else in that namespace is not a
// league.
export function sportarrLeagueExternalIdFromNativeId(
  value: string | undefined | null,
): string | null {
  const id = value?.trim().toLowerCase();
  return id && isLeagueId(id) ? id : null;
}

// The number inside a league id (lg-000278 -> 278), which is how the
// metadata layer keys a provider id.
export function sportarrLeagueNumberFromExternalId(
  externalId: string | undefined | null,
): number | undefined {
  const leagueId = sportarrLeagueExternalIdFromNativeId(externalId);
  if (!leagueId) {
    return undefined;
  }
  const n = Number(leagueId.slice(LEAGUE_ID_PREFIX.length));
  return n > 0 ? n : undefined;
}

// The league id for its number (278 -> lg-000278). Ids grow past the pad
// width unpadded.
export function sportarrLeagueExternalIdFromNumber(n: number): string {
  return `${LEAGUE_ID_PREFIX}${String(n).padStart(LEAGUE_ID_PAD, '0')}`;
}

// Before the agents stamped the native id they only carried a numeric alias
// in the tvdb namespace (e.g. tvdb://900000278). Libraries that were never
// refreshed since still resolve through it. Values outside the reserved
// league alias range (900,000,000-999,999,999) are not Sportarr league ids.
export function sportarrLeagueNumberFromTvdbAlias(
  tvdbAlias: number | undefined | null,
): number | undefined {
  if (
    tvdbAlias === undefined ||
    tvdbAlias === null ||
    !Number.isInteger(tvdbAlias)
  ) {
    return undefined;
  }
  const n = tvdbAlias - SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET;
  return n > 0 && n < SPORTARR_TVDB_ALIAS_RANGE ? n : undefined;
}

// Reverse the tvdb alias back to the canonical league external id
// (900000278 -> lg-000278).
export function sportarrLeagueExternalIdFromTvdbAlias(
  tvdbAlias: number | undefined | null,
): string | null {
  const n = sportarrLeagueNumberFromTvdbAlias(tvdbAlias);
  return n === undefined ? null : sportarrLeagueExternalIdFromNumber(n);
}

// Resolve the league from everything a media-server item carries. The native
// `sportarr` id wins; the tvdb alias is the fallback for a show that predates
// it. A media-server item can carry several tvdb guids (e.g. a real TVDB id
// from an agent match alongside the alias), in no guaranteed order, so scan
// them all for the one inside the reserved range instead of trusting the
// first entry.
export function sportarrLeagueExternalIdFromProviderIds(
  providerIds: MediaProviderIds | undefined | null,
): string | null {
  for (const candidate of providerIds?.sportarr ?? []) {
    const externalId = sportarrLeagueExternalIdFromNativeId(candidate);
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
  return null;
}
