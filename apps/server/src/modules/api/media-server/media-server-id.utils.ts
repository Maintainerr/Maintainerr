import { MediaServerType } from '@maintainerr/contracts';

const JELLYFIN_EMPTY_GUID_DASHED = '00000000-0000-0000-0000-000000000000';
const JELLYFIN_EMPTY_GUID_UNDASHED = '00000000000000000000000000000000';

export function isBlankMediaServerId(
  value: string | null | undefined,
): boolean {
  return value === undefined || value === null || value.trim() === '';
}

export function isLikelyPlexId(value: string): boolean {
  if (isBlankMediaServerId(value)) {
    return false;
  }

  for (const char of value) {
    if (char < '0' || char > '9') {
      return false;
    }
  }

  return true;
}

export function isLikelyJellyfinId(value: string): boolean {
  if (isBlankMediaServerId(value)) {
    return false;
  }

  if (value.length === 32) {
    return isHexSegment(value);
  }

  if (value.length === 36) {
    return isDashedUuid(value);
  }

  return false;
}

// Emby shares Jellyfin's .NET-derived ID conventions (32-char hex or
// 36-char dashed UUID), so the same heuristic applies. Wrapper kept for
// call-site clarity at sites that branch by server type.
export function isLikelyEmbyId(value: string): boolean {
  return isLikelyJellyfinId(value);
}

// Kodi IDs are composite `<type>-<digits>` (e.g. movie-1), since Kodi's library
// IDs are per-type integers that overlap across types.
const KODI_ID_TYPES = ['movie', 'show', 'season', 'episode'];
export function isLikelyKodiId(value: string): boolean {
  if (isBlankMediaServerId(value)) {
    return false;
  }
  const sep = value.indexOf('-');
  if (sep <= 0 || sep === value.length - 1) {
    return false;
  }
  const type = value.slice(0, sep);
  if (!KODI_ID_TYPES.includes(type)) {
    return false;
  }
  for (const char of value.slice(sep + 1)) {
    if (char < '0' || char > '9') {
      return false;
    }
  }
  return true;
}

export function isJellyfinEmptyGuid(value: string): boolean {
  return (
    value === JELLYFIN_EMPTY_GUID_DASHED ||
    value === JELLYFIN_EMPTY_GUID_UNDASHED
  );
}

export function isForeignServerId(
  serverType: MediaServerType,
  value: string,
): boolean {
  if (isBlankMediaServerId(value)) {
    return true;
  }

  if (serverType === MediaServerType.JELLYFIN) {
    return isLikelyPlexId(value);
  }

  if (serverType === MediaServerType.PLEX) {
    return isLikelyJellyfinId(value);
  }

  if (serverType === MediaServerType.EMBY) {
    // Emby IDs share Jellyfin's shape; a Plex numeric ID is foreign to Emby.
    return isLikelyPlexId(value);
  }

  if (serverType === MediaServerType.KODI) {
    // Kodi IDs are composite; anything not in that shape is foreign.
    return !isLikelyKodiId(value);
  }

  return false;
}

export function shouldRefreshMetadataItemId(
  serverType: MediaServerType,
  value: string,
): boolean {
  if (isForeignServerId(serverType, value)) {
    return false;
  }

  // Jellyfin Ids are always either 32-char unbroken hex or a 36-char dashed
  // UUID. Anything else — truncated strings, garbage from migrations, the
  // all-zero "empty Guid" — is rejected before the refresh request is issued
  // so Jellyfin doesn't end up parsing the route as `Guid.Empty` and spamming
  // `ProviderManager.StartProcessingRefreshQueue` with "Guid can't be empty"
  // errors (#2853). The previous filter only rejected the all-zero Guid and
  // pure-numeric (Plex-shaped) IDs, leaving every other malformed string to
  // slip through.
  if (serverType === MediaServerType.JELLYFIN) {
    return isLikelyJellyfinId(value) && !isJellyfinEmptyGuid(value);
  }

  if (serverType === MediaServerType.EMBY) {
    return isLikelyEmbyId(value) && !isJellyfinEmptyGuid(value);
  }

  if (serverType === MediaServerType.KODI) {
    return isLikelyKodiId(value);
  }

  return true;
}

function isDashedUuid(value: string): boolean {
  if (value.length !== 36) {
    return false;
  }

  for (let i = 0; i < 36; i++) {
    const char = value[i];
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      if (char !== '-') {
        return false;
      }
    } else {
      const lower = char.toLowerCase();
      if (!((lower >= '0' && lower <= '9') || (lower >= 'a' && lower <= 'f'))) {
        return false;
      }
    }
  }

  return true;
}

function isHexSegment(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  for (const char of value) {
    const lower = char.toLowerCase();
    if (!((lower >= '0' && lower <= '9') || (lower >= 'a' && lower <= 'f'))) {
      return false;
    }
  }

  return true;
}
