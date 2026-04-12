export interface RequestTargetConfig {
  baseURL?: string;
  params?: unknown;
}

export function normalizeExternalApiBaseUrl(baseUrl: string): string {
  const parsedUrl = new URL(baseUrl);

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('External API base URL must use http:// or https://');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error(
      'External API base URL must not include embedded credentials',
    );
  }

  parsedUrl.hash = '';

  let normalizedUrl = parsedUrl.toString();
  while (normalizedUrl.endsWith('/')) normalizedUrl = normalizedUrl.slice(0, -1);

  return normalizedUrl;
}

export function describeRequestTarget(
  fallbackBaseURL: string | undefined,
  endpoint: string | undefined,
  config?: RequestTargetConfig,
): string {
  let base = config?.baseURL ?? fallbackBaseURL ?? '';
  while (base.endsWith('/')) base = base.slice(0, -1);

  let path = endpoint ?? '';
  while (path.startsWith('/')) path = path.slice(1);

  let target: string;
  if (!base) target = '/' + path;
  else if (!path) target = base;
  else target = base + '/' + path;

  const query = serializeParams(config?.params);
  if (query) target += (target.includes('?') ? '&' : '?') + query;
  return target;
}

function serializeParams(params: unknown): string {
  if (!params || typeof params !== 'object') return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    parts.push(
      encodeURIComponent(key) + '=' + encodeURIComponent(String(value)),
    );
  }
  return parts.join('&');
}
