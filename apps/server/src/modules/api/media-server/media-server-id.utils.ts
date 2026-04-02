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

  return false;
}

export function shouldRefreshMetadataItemId(
  serverType: MediaServerType,
  value: string,
): boolean {
  if (isForeignServerId(serverType, value)) {
    return false;
  }

  if (serverType === MediaServerType.JELLYFIN) {
    return !isJellyfinEmptyGuid(value);
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
