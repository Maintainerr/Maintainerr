import {
  isSportarrTvdbAlias,
  MediaProviderIds,
  SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET,
} from '@maintainerr/contracts';

const LEAGUE_ID_PREFIX = 'lg-';
const LEAGUE_ID_PAD = 6;

// The league number inside a Sportarr short id (lg-000278 -> 278). Event ids
// (ev-...) live on episodes and never identify a league, so only the `lg-`
// prefix parses.
export function sportarrLeagueNumberFromExternalId(
  value: string | undefined | null,
): number | undefined {
  const id = value?.trim().toLowerCase();
  if (!id?.startsWith(LEAGUE_ID_PREFIX)) {
    return undefined;
  }

  const digits = id.slice(LEAGUE_ID_PREFIX.length);
  if (!digits.length) {
    return undefined;
  }
  for (let i = 0; i < digits.length; i++) {
    const code = digits.charCodeAt(i);
    if (code < 48 || code > 57) {
      return undefined;
    }
  }

  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

// The league id for its number (278 -> lg-000278). Ids grow past the pad width
// unpadded.
export function sportarrLeagueExternalIdFromNumber(n: number): string {
  return `${LEAGUE_ID_PREFIX}${String(n).padStart(LEAGUE_ID_PAD, '0')}`;
}

// The canonical league id from the `sportarr` namespace the Sportarr media
// server agents stamp on a show (Plex `sportarr://lg-000278`, Jellyfin and
// Emby `ProviderIds.Sportarr`). Re-padded, because the connection matches it
// against Sportarr's own externalId by exact string.
function leagueExternalIdFromNativeId(
  value: string | undefined | null,
): string | null {
  const n = sportarrLeagueNumberFromExternalId(value);
  return n === undefined ? null : sportarrLeagueExternalIdFromNumber(n);
}

// Before the agents stamped the native id they only carried a numeric alias in
// the tvdb namespace (e.g. tvdb://900000278). Libraries that were never
// refreshed since still resolve through it.
export function sportarrLeagueNumberFromTvdbAlias(
  tvdbAlias: number | undefined | null,
): number | undefined {
  if (!isSportarrTvdbAlias(tvdbAlias)) {
    return undefined;
  }

  // The offset itself is the bottom of the window, not league 0.
  const n = tvdbAlias - SPORTARR_TVDB_ALIAS_LEAGUE_OFFSET;
  return n > 0 ? n : undefined;
}

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
  return null;
}
