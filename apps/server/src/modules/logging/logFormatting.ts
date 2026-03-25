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

const REDACTED_VALUE = '****';

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const redactSensitiveValue = (value: string): string => {
  let sanitized = value;

  sanitized = sanitized.replace(
    /(Authorization\s*[:=]\s*)(Bearer|Basic)\s+([^,\s"'&]+)/gi,
    `$1$2 ${REDACTED_VALUE}`,
  );

  for (const key of SENSITIVE_PARAM_KEYS) {
    const keyPattern = escapeRegex(key);

    sanitized = sanitized.replace(
      new RegExp(`([?&]${keyPattern}=)([^&#\\s]+)`, 'gi'),
      `$1${REDACTED_VALUE}`,
    );

    sanitized = sanitized.replace(
      new RegExp(`(${keyPattern}\\s*[:=]\\s*)([^,&\\s\"']+)`, 'gi'),
      `$1${REDACTED_VALUE}`,
    );
  }

  for (const segment of SENSITIVE_PATH_SEGMENTS) {
    const segmentPattern = escapeRegex(segment);
    sanitized = sanitized.replace(
      new RegExp(`(/${segmentPattern}/)([^/?#\\s]+)`, 'gi'),
      `$1${REDACTED_VALUE}`,
    );
  }

  return sanitized;
};

export const sanitizeLogValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactSensitiveValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry));
  }

  if (value instanceof Error) {
    return {
      ...value,
      name: value.name,
      message: redactSensitiveValue(value.message),
      stack: value.stack ? redactSensitiveValue(value.stack) : value.stack,
      cause: sanitizeLogValue(value.cause),
    };
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        sanitizeLogValue(entry),
      ]),
    );
  }

  return value;
};

export const sanitizeLogInfo = <T extends Record<string, unknown>>(
  info: T,
): T => sanitizeLogValue(info) as T;

export const formatLogMessage = (message: any, stack: any) => {
  message = sanitizeLogValue(message);
  stack = sanitizeLogValue(stack);

  if (Array.isArray(stack) && stack.length > 0 && stack[0] != null) {
    let stackMessage = '';

    if (stack[0] instanceof Error) {
      stackMessage = stack[0].stack;
    } else if (typeof stack[0] === 'string') {
      stackMessage = stack[0];
    }

    if (typeof message === 'string' && stackMessage.includes(message)) {
      // Remove duplicate messaging
      message = stackMessage;
    } else {
      message = `${message}\n${stackMessage}`;
    }
  }

  return message;
};
