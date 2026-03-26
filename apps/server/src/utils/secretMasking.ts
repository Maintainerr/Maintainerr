const FULL_MASK = '****';
const VISIBLE_CHARS = 3;

const SENSITIVE_PARAM_KEYS = [
  'api_key',
  'apikey',
  'x-api-key',
  'token',
  'auth_token',
  'access_token',
  'refresh_token',
  'plex_auth_token',
] as const;

const SENSITIVE_PATH_SEGMENTS = ['token'];

const isWhitespace = (character: string | undefined): boolean =>
  character === ' ' ||
  character === '\t' ||
  character === '\n' ||
  character === '\r';

const isIdentifierCharacter = (character: string | undefined): boolean => {
  if (!character) {
    return false;
  }

  const code = character.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) ||
    (code >= 65 && code <= 90) ||
    (code >= 48 && code <= 57) ||
    character === '_' ||
    character === '-'
  );
};

const replaceRange = (
  value: string,
  startIndex: number,
  endIndex: number,
  replacement: string,
): string =>
  `${value.slice(0, startIndex)}${replacement}${value.slice(endIndex)}`;

const maskBetween = (
  value: string,
  startIndex: number,
  shouldStop: (character: string | undefined) => boolean,
): { value: string; nextIndex: number } => {
  let endIndex = startIndex;

  while (endIndex < value.length && !shouldStop(value[endIndex])) {
    endIndex += 1;
  }

  if (startIndex === endIndex) {
    return { value, nextIndex: endIndex };
  }

  const masked = maskSecretString(value.slice(startIndex, endIndex));
  return {
    value: replaceRange(value, startIndex, endIndex, masked),
    nextIndex: startIndex + masked.length,
  };
};

const sanitizeAuthorizationValues = (value: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;

  while (searchIndex < sanitized.length) {
    const authorizationIndex = lower.indexOf('authorization', searchIndex);

    if (authorizationIndex === -1) {
      return sanitized;
    }

    if (isIdentifierCharacter(sanitized[authorizationIndex - 1])) {
      searchIndex = authorizationIndex + 1;
      continue;
    }

    let cursor = authorizationIndex + 'authorization'.length;
    while (isWhitespace(sanitized[cursor])) {
      cursor += 1;
    }

    if (sanitized[cursor] !== ':' && sanitized[cursor] !== '=') {
      searchIndex = authorizationIndex + 1;
      continue;
    }

    cursor += 1;
    while (isWhitespace(sanitized[cursor])) {
      cursor += 1;
    }

    const scheme = lower.startsWith('bearer', cursor)
      ? 'bearer'
      : lower.startsWith('basic', cursor)
        ? 'basic'
        : null;

    if (!scheme) {
      searchIndex = authorizationIndex + 1;
      continue;
    }

    cursor += scheme.length;
    if (!isWhitespace(sanitized[cursor])) {
      searchIndex = authorizationIndex + 1;
      continue;
    }

    while (isWhitespace(sanitized[cursor])) {
      cursor += 1;
    }

    const result = maskBetween(
      sanitized,
      cursor,
      (character) =>
        character === ',' ||
        character === '&' ||
        character === '"' ||
        character === "'" ||
        isWhitespace(character),
    );
    sanitized = result.value;
    lower = sanitized.toLowerCase();
    searchIndex = result.nextIndex;
  }

  return sanitized;
};

const sanitizeQueryParameterValues = (value: string, key: string): string => {
  let sanitized = value;
  let lower = sanitized.toLowerCase();
  let searchIndex = 0;
  const token = `${key}=`;

  while (searchIndex < sanitized.length) {
    const tokenIndex = lower.indexOf(token, searchIndex);

    if (tokenIndex === -1) {
      return sanitized;
    }

    const prefix = sanitized[tokenIndex - 1];
    if (prefix !== '?' && prefix !== '&') {
      searchIndex = tokenIndex + 1;
      continue;
    }

    const result = maskBetween(
      sanitized,
      tokenIndex + token.length,
      (character) =>
        character === '&' || character === '#' || isWhitespace(character),
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
    const keyIndex = lower.indexOf(key, searchIndex);

    if (keyIndex === -1) {
      return sanitized;
    }

    if (isIdentifierCharacter(sanitized[keyIndex - 1])) {
      searchIndex = keyIndex + 1;
      continue;
    }

    let cursor = keyIndex + key.length;
    while (isWhitespace(sanitized[cursor])) {
      cursor += 1;
    }

    if (sanitized[cursor] !== ':' && sanitized[cursor] !== '=') {
      searchIndex = keyIndex + 1;
      continue;
    }

    cursor += 1;
    while (isWhitespace(sanitized[cursor])) {
      cursor += 1;
    }

    const result = maskBetween(
      sanitized,
      cursor,
      (character) =>
        character === ',' ||
        character === '&' ||
        character === '"' ||
        character === "'" ||
        isWhitespace(character),
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
    const segmentIndex = lower.indexOf(token, searchIndex);

    if (segmentIndex === -1) {
      return sanitized;
    }

    const result = maskBetween(
      sanitized,
      segmentIndex + token.length,
      (character) =>
        character === '/' ||
        character === '?' ||
        character === '#' ||
        isWhitespace(character),
    );
    sanitized = result.value;
    lower = sanitized.toLowerCase();
    searchIndex = result.nextIndex;
  }

  return sanitized;
};

export const maskSecret = (value: string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }

  if (value === '') {
    return '';
  }

  if (value.length <= VISIBLE_CHARS * 2) {
    return FULL_MASK;
  }

  return `${value.slice(0, VISIBLE_CHARS)}...${value.slice(-VISIBLE_CHARS)}`;
};

export const maskSecretString = (value: string): string =>
  maskSecret(value) ?? FULL_MASK;

export const sanitizeSecretString = (value: string): string => {
  let sanitized = sanitizeAuthorizationValues(value);

  for (const key of SENSITIVE_PARAM_KEYS) {
    sanitized = sanitizeQueryParameterValues(sanitized, key);
    sanitized = sanitizeKeyValueValues(sanitized, key);
  }

  for (const segment of SENSITIVE_PATH_SEGMENTS) {
    sanitized = sanitizePathSegmentValues(sanitized, segment);
  }

  return sanitized;
};

export const sanitizeSecretValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return sanitizeSecretString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSecretValue(entry));
  }

  if (value instanceof Error) {
    return {
      ...value,
      name: value.name,
      message: sanitizeSecretString(value.message),
      stack: value.stack ? sanitizeSecretString(value.stack) : value.stack,
      cause: sanitizeSecretValue(value.cause),
    };
  }

  if (value && typeof value === 'object') {
    const source = value as Record<PropertyKey, unknown>;
    const clone = {} as Record<PropertyKey, unknown>;

    for (const key of Reflect.ownKeys(source)) {
      clone[key] = sanitizeSecretValue(source[key]);
    }

    return clone;
  }

  return value;
};

export const sanitizeSecretInfo = <T extends Record<string, unknown>>(
  info: T,
): T => {
  const record = info as Record<PropertyKey, unknown>;

  for (const key of Reflect.ownKeys(record)) {
    record[key] = sanitizeSecretValue(record[key]);
  }

  return info;
};
