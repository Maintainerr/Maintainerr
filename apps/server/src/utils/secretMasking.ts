import {
  maskSecret as sharedMaskSecret,
  maskSecretString as sharedMaskSecretString,
} from '@maintainerr/contracts';

const SENSITIVE_PARAM_KEYS = [
  'api_key',
  'apikey',
  'x-api-key',
  'x-plex-token',
  'token',
  'auth_token',
  'access_token',
  'refresh_token',
  'plex_auth_token',
] as const;

const SENSITIVE_PATH_SEGMENTS = ['token'];

const isWhitespace = (c: string | undefined): boolean =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r';

const isIdentifierCharacter = (c: string | undefined): boolean => {
  if (!c) return false;
  const code = c.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    (code >= 48 && code <= 57) ||
    c === '_' ||
    c === '-'
  );
};

const isDigit = (c: string | undefined): boolean =>
  c !== undefined && c >= '0' && c <= '9';

const isUrlTerminator = (c: string | undefined): boolean =>
  c === undefined ||
  isWhitespace(c) ||
  c === '"' ||
  c === "'" ||
  c === '<' ||
  c === '>' ||
  c === '(' ||
  c === '[' ||
  c === '{';

const isTrailingUrlPunctuation = (c: string | undefined): boolean =>
  c === '.' ||
  c === ',' ||
  c === ';' ||
  c === ':' ||
  c === '!' ||
  c === '?' ||
  c === ')' ||
  c === ']' ||
  c === '}';

const isDnsHostTerminator = (c: string | undefined): boolean =>
  isWhitespace(c) ||
  c === ':' ||
  c === '/' ||
  c === '\\' ||
  c === '|' ||
  c === ',' ||
  c === ';' ||
  c === ')' ||
  c === ']' ||
  c === '}';

const replaceRange = (
  value: string,
  start: number,
  end: number,
  replacement: string,
): string => `${value.slice(0, start)}${replacement}${value.slice(end)}`;

const maskBetween = (
  value: string,
  startIndex: number,
  shouldStop: (c: string | undefined) => boolean,
): { value: string; nextIndex: number } => {
  let endIndex = startIndex;
  while (endIndex < value.length && !shouldStop(value[endIndex])) endIndex++;
  if (startIndex === endIndex) return { value, nextIndex: endIndex };
  const masked = maskSecretString(value.slice(startIndex, endIndex));
  return {
    value: replaceRange(value, startIndex, endIndex, masked),
    nextIndex: startIndex + masked.length,
  };
};

export const maskSecret = sharedMaskSecret;
export const maskSecretString = sharedMaskSecretString;

const hasDigitsOnly = (value: string, start: number): boolean => {
  if (start >= value.length) return false;

  for (let i = start; i < value.length; i++) {
    if (!isDigit(value[i])) return false;
  }

  return true;
};

const readBracketedSegmentEnd = (value: string, start: number): number => {
  let cursor = start + 1;
  while (cursor < value.length && value[cursor] !== ']') cursor++;
  if (cursor < value.length) cursor++;
  return cursor;
};

const findUrlEnd = (value: string, start: number): number => {
  let end = start;

  if (value[end] === '[') {
    end = readBracketedSegmentEnd(value, end);
  }

  while (end < value.length && !isUrlTerminator(value[end])) end++;
  return end;
};

const findUrlSuffixStart = (
  value: string,
  start: number,
  end: number,
): number => {
  let split = end;

  for (const separator of ['/', '?', '#'] as const) {
    const index = value.indexOf(separator, start);
    if (index !== -1 && index < split) split = index;
  }

  return split;
};

const readDnsHostEnd = (value: string, start: number): number => {
  if (value[start] === '[') {
    return readBracketedSegmentEnd(value, start);
  }

  let cursor = start;
  while (cursor < value.length && !isDnsHostTerminator(value[cursor])) cursor++;
  return cursor;
};

const maskIPv4 = (value: string): string | undefined => {
  let cursor = 0;
  let firstEnd = -1;
  let lastStart = -1;

  for (let octet = 0; octet < 4; octet++) {
    if (octet > 0) {
      if (value[cursor] !== '.') return undefined;
      if (octet === 3) lastStart = cursor + 1;
      cursor++;
    }

    const start = cursor;
    while (cursor < value.length && isDigit(value[cursor])) cursor++;

    const digits = cursor - start;
    if (
      digits === 0 ||
      digits > 3 ||
      parseInt(value.slice(start, cursor), 10) > 255
    ) {
      return undefined;
    }

    if (octet === 0) firstEnd = cursor;
  }

  if (cursor !== value.length) return undefined;

  return `${value.slice(0, firstEnd)}.***.***.${value.slice(lastStart)}`;
};

// Masks a plain hostname (no port, no brackets): IPv4, plex.direct, or generic.
const maskHost = (host: string): string => {
  const maskedIPv4 = maskIPv4(host);
  if (maskedIPv4) return maskedIPv4;

  // plex.direct: mask the prefix, keep the suffix
  const plexSuffix = '.plex.direct';
  if (
    host.length > plexSuffix.length &&
    host.toLowerCase().endsWith(plexSuffix)
  ) {
    return `${maskSecretString(host.slice(0, -plexSuffix.length))}${plexSuffix}`;
  }

  return maskSecretString(host);
};

// Masks a URL authority (host, [IPv6]:port, host:port).
const maskUrlAuthority = (authority: string): string => {
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']');
    if (close !== -1) {
      return `[${maskSecretString(authority.slice(1, close))}]${authority.slice(close + 1)}`;
    }
  }

  // Only treat as host:port when there is exactly one colon — multiple colons
  // means a bare IPv6 literal (e.g. 2001:db8::1), which must not be split.
  const colonIdx = authority.lastIndexOf(':');
  if (
    colonIdx > 0 &&
    authority.indexOf(':') === colonIdx &&
    hasDigitsOnly(authority, colonIdx + 1)
  ) {
    return `${maskHost(authority.slice(0, colonIdx))}${authority.slice(colonIdx)}`;
  }

  return maskHost(authority);
};

const sanitizeAuthorizationValues = (value: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < sanitized.length) {
    const bearerIdx = lower.indexOf('bearer', searchIndex);
    const basicIdx = lower.indexOf('basic', searchIndex);

    if (bearerIdx === -1 && basicIdx === -1) return sanitized;

    // Pick whichever scheme appears first
    const schemeIdx =
      bearerIdx === -1 || (basicIdx !== -1 && basicIdx < bearerIdx)
        ? basicIdx
        : bearerIdx;
    const scheme = schemeIdx === bearerIdx ? 'bearer' : 'basic';

    if (isIdentifierCharacter(sanitized[schemeIdx - 1])) {
      searchIndex = schemeIdx + 1;
      continue;
    }

    let cursor = schemeIdx + scheme.length;

    if (!isWhitespace(sanitized[cursor])) {
      searchIndex = schemeIdx + 1;
      continue;
    }
    while (isWhitespace(sanitized[cursor])) cursor++;

    const result = maskBetween(
      sanitized,
      cursor,
      (c) =>
        c === ',' || c === '&' || c === '"' || c === "'" || isWhitespace(c),
    );
    sanitized = result.value;
    lower = sanitized.toLowerCase();
    searchIndex = result.nextIndex;
  }

  return sanitized;
};

const sanitizeHttpUrls = (value: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < sanitized.length) {
    const httpIdx = lower.indexOf('http', searchIndex);
    if (httpIdx === -1) return sanitized;

    const scheme = lower.startsWith('https://', httpIdx)
      ? 'https://'
      : lower.startsWith('http://', httpIdx)
        ? 'http://'
        : null;

    if (!scheme || isIdentifierCharacter(sanitized[httpIdx - 1])) {
      searchIndex = httpIdx + 4;
      continue;
    }

    const urlStart = httpIdx + scheme.length;
    const urlEnd = findUrlEnd(sanitized, urlStart);

    let maskEnd = urlEnd;
    while (
      maskEnd > urlStart &&
      isTrailingUrlPunctuation(sanitized[maskEnd - 1])
    )
      maskEnd--;

    if (maskEnd === urlStart) {
      searchIndex = urlEnd;
      continue;
    }

    const splitIdx = findUrlSuffixStart(sanitized, urlStart, maskEnd);
    const authority = sanitized.slice(urlStart, splitIdx);
    const suffix = sanitized.slice(splitIdx, maskEnd);
    const maskedSuffix =
      suffix === '/' ? '/' : suffix.length > 0 ? maskSecretString(suffix) : '';
    const maskedUrl = maskUrlAuthority(authority) + maskedSuffix;

    sanitized = replaceRange(sanitized, urlStart, maskEnd, maskedUrl);
    lower = sanitized.toLowerCase();
    searchIndex = urlStart + maskedUrl.length;
  }

  return sanitized;
};

const sanitizeQueryParameterValues = (value: string, key: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;
  const token = `${key}=`;

  while (searchIndex < sanitized.length) {
    const tokenIdx = lower.indexOf(token, searchIndex);
    if (tokenIdx === -1) return sanitized;

    const prefix = sanitized[tokenIdx - 1];
    if (prefix !== '?' && prefix !== '&') {
      searchIndex = tokenIdx + 1;
      continue;
    }

    const result = maskBetween(
      sanitized,
      tokenIdx + token.length,
      (c) => c === '&' || c === '#' || isWhitespace(c),
    );
    sanitized = result.value;
    lower = sanitized.toLowerCase();
    searchIndex = result.nextIndex;
  }

  return sanitized;
};

const sanitizeKeyValueValues = (value: string, key: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < sanitized.length) {
    const keyIdx = lower.indexOf(key, searchIndex);
    if (keyIdx === -1) return sanitized;

    if (isIdentifierCharacter(sanitized[keyIdx - 1])) {
      searchIndex = keyIdx + 1;
      continue;
    }

    let cursor = keyIdx + key.length;
    while (isWhitespace(sanitized[cursor])) cursor++;

    if (sanitized[cursor] !== ':' && sanitized[cursor] !== '=') {
      searchIndex = keyIdx + 1;
      continue;
    }
    cursor++;
    while (isWhitespace(sanitized[cursor])) cursor++;

    const result = maskBetween(
      sanitized,
      cursor,
      (c) =>
        c === ',' || c === '&' || c === '"' || c === "'" || isWhitespace(c),
    );
    sanitized = result.value;
    lower = sanitized.toLowerCase();
    searchIndex = result.nextIndex;
  }

  return sanitized;
};

const sanitizePathSegmentValues = (value: string, segment: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;
  const token = `/${segment}/`;

  while (searchIndex < sanitized.length) {
    const segIdx = lower.indexOf(token, searchIndex);
    if (segIdx === -1) return sanitized;

    const result = maskBetween(
      sanitized,
      segIdx + token.length,
      (c) => c === '/' || c === '?' || c === '#' || isWhitespace(c),
    );
    sanitized = result.value;
    lower = sanitized.toLowerCase();
    searchIndex = result.nextIndex;
  }

  return sanitized;
};

const sanitizeIPv4Addresses = (value: string): string => {
  let sanitized = value;
  let i = 0;

  while (i < sanitized.length) {
    if (!isDigit(sanitized[i])) {
      i++;
      continue;
    }

    const before = sanitized[i - 1];
    if (
      before !== undefined &&
      (isIdentifierCharacter(before) || before === '.')
    ) {
      i++;
      continue;
    }

    let cursor = i;
    while (
      cursor < sanitized.length &&
      (isDigit(sanitized[cursor]) || sanitized[cursor] === '.')
    ) {
      cursor++;
    }

    const after = sanitized[cursor];
    const masked = maskIPv4(sanitized.slice(i, cursor));
    if (
      masked &&
      (after === undefined || (after !== '.' && (after < '0' || after > '9')))
    ) {
      sanitized = replaceRange(sanitized, i, cursor, masked);
      i += masked.length;
    } else {
      i++;
    }
  }

  return sanitized;
};

const sanitizePlexDirectHostnames = (value: string): string => {
  const plexSuffix = '.plex.direct';
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < sanitized.length) {
    const suffixIdx = lower.indexOf(plexSuffix, searchIndex);
    if (suffixIdx === -1) return sanitized;

    const suffixEnd = suffixIdx + plexSuffix.length;
    const afterChar = sanitized[suffixEnd];
    if (
      afterChar !== undefined &&
      (afterChar === '.' || isIdentifierCharacter(afterChar))
    ) {
      searchIndex = suffixEnd;
      continue;
    }

    let hostStart = suffixIdx;
    while (
      hostStart > 0 &&
      (sanitized[hostStart - 1] === '.' ||
        isIdentifierCharacter(sanitized[hostStart - 1]))
    ) {
      hostStart--;
    }

    const prefix = sanitized.slice(hostStart, suffixIdx);
    if (prefix.length === 0) {
      searchIndex = suffixEnd;
      continue;
    }

    const masked = maskSecretString(prefix) + plexSuffix;
    sanitized = replaceRange(sanitized, hostStart, suffixEnd, masked);
    lower = sanitized.toLowerCase();
    searchIndex = hostStart + masked.length;
  }

  return sanitized;
};

const sanitizeDnsResolutionHosts = (value: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();

  for (const marker of ['enotfound', 'eai_again']) {
    let searchIndex = 0;

    while (searchIndex < sanitized.length) {
      const markerIdx = lower.indexOf(marker, searchIndex);
      if (markerIdx === -1) break;

      if (isIdentifierCharacter(sanitized[markerIdx - 1])) {
        searchIndex = markerIdx + 1;
        continue;
      }

      let cursor = markerIdx + marker.length;
      if (!isWhitespace(sanitized[cursor])) {
        searchIndex = cursor;
        continue;
      }
      while (isWhitespace(sanitized[cursor])) cursor++;

      const hostStart = cursor;
      cursor = readDnsHostEnd(sanitized, hostStart);

      if (cursor === hostStart) {
        searchIndex = markerIdx + marker.length;
        continue;
      }

      const maskedHost = maskUrlAuthority(sanitized.slice(hostStart, cursor));
      sanitized = replaceRange(sanitized, hostStart, cursor, maskedHost);
      lower = sanitized.toLowerCase();
      searchIndex = hostStart + maskedHost.length;
    }
  }

  return sanitized;
};

export const sanitizeSecretString = (value: string): string => {
  let sanitized = sanitizeAuthorizationValues(value);

  for (const key of SENSITIVE_PARAM_KEYS) {
    sanitized = sanitizeQueryParameterValues(sanitized, key);
    sanitized = sanitizeKeyValueValues(sanitized, key);
  }

  for (const segment of SENSITIVE_PATH_SEGMENTS) {
    sanitized = sanitizePathSegmentValues(sanitized, segment);
  }

  sanitized = sanitizeHttpUrls(sanitized);
  sanitized = sanitizeIPv4Addresses(sanitized);
  sanitized = sanitizePlexDirectHostnames(sanitized);
  sanitized = sanitizeDnsResolutionHosts(sanitized);

  return sanitized;
};

const sanitizeSecretValueInternal = (
  value: unknown,
  seen: WeakMap<object, unknown>,
): unknown => {
  if (typeof value === 'string') return sanitizeSecretString(value);

  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value);
    const clone: unknown[] = [];
    seen.set(value, clone);
    for (const item of value)
      clone.push(sanitizeSecretValueInternal(item, seen));
    return clone;
  }

  if (value instanceof Error) {
    if (seen.has(value)) return seen.get(value);
    const clone = {} as Record<PropertyKey, unknown>;
    seen.set(value, clone);
    for (const key of Reflect.ownKeys(value)) {
      if (
        key !== 'name' &&
        key !== 'message' &&
        key !== 'stack' &&
        key !== 'cause'
      ) {
        clone[key] = sanitizeSecretValueInternal(
          (value as unknown as Record<PropertyKey, unknown>)[key],
          seen,
        );
      }
    }
    clone.name = value.name;
    clone.message = sanitizeSecretString(value.message);
    clone.stack = value.stack ? sanitizeSecretString(value.stack) : value.stack;
    clone.cause = sanitizeSecretValueInternal(value.cause, seen);
    return clone;
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) return seen.get(value);
    const source = value as Record<PropertyKey, unknown>;
    const clone = {} as Record<PropertyKey, unknown>;
    seen.set(source, clone);
    for (const key of Reflect.ownKeys(source)) {
      clone[key] = sanitizeSecretValueInternal(source[key], seen);
    }
    return clone;
  }

  return value;
};

export const sanitizeSecretValue = (value: unknown): unknown =>
  sanitizeSecretValueInternal(value, new WeakMap());

export const sanitizeSecretInfo = <T extends Record<string, unknown>>(
  info: T,
): T => {
  const record = info as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(record)) {
    record[key] = sanitizeSecretValue(record[key]);
  }
  return info;
};
