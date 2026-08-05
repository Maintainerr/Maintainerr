import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * The UI is served by this same Nest process (ServeStaticModule) in production
 * and proxied through Vite's `/api` proxy in development, so first-party
 * requests are always same-origin and never need CORS headers at all.
 *
 * Returning `undefined` means "do not call enableCors", so no CORS middleware
 * is registered and no Access-Control-Allow-Origin header can be emitted.
 */
export function resolveCorsOptions(
  env: NodeJS.ProcessEnv = process.env,
): CorsOptions | undefined {
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  if (allowedOrigins.length > 0) {
    // Array form reflects the request origin only when it matches an entry,
    // and adds `Vary: Origin` so caches never share the response.
    return { origin: allowedOrigins };
  }

  if (env.NODE_ENV === 'production') {
    return undefined;
  }

  // Development only: reflect whatever origin asks, so a UI served from another
  // port or host (and API pokes from tooling) keeps working.
  return { origin: true };
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const origins: string[] = [];

  for (const entry of value.split(',')) {
    const origin = entry.trim();

    if (origin.length > 0) {
      origins.push(origin);
    }
  }

  return origins;
}
