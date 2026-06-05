import { LOG_LEVELS, LogLevel } from '@maintainerr/contracts';

const ALLOWED_LOG_LEVELS = new Set<string>(LOG_LEVELS);

export interface ResolvedLogLevel {
  /** The level the logger should actually use. */
  level: LogLevel;
  /**
   * The raw `LOG_LEVEL` value when it was set but not recognised. Present only
   * so the caller can warn about the typo; absent when the env var is unset or
   * valid.
   */
  invalidEnvValue?: string;
}

/**
 * Resolve the effective winston log level.
 *
 * `LOG_LEVEL`, when set to one of the recognised levels, overrides the
 * persisted setting for the lifetime of the process so operators can change
 * verbosity for a single container without writing the database. An empty or
 * whitespace-only value is treated as unset. An unrecognised value is ignored
 * (reported via `invalidEnvValue` so the caller can warn) and the persisted
 * level is used instead.
 */
export function resolveLogLevel(
  rawEnvValue: string | undefined,
  dbLevel: LogLevel,
): ResolvedLogLevel {
  const envLevel = rawEnvValue?.trim().toLowerCase();
  if (!envLevel) {
    return { level: dbLevel };
  }
  if (ALLOWED_LOG_LEVELS.has(envLevel)) {
    return { level: envLevel as LogLevel };
  }
  return { level: dbLevel, invalidEnvValue: rawEnvValue };
}
