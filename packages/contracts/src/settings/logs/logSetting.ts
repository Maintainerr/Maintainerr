import z from 'zod'

export const LOG_LEVELS = [
  'debug',
  'verbose',
  'info',
  'warn',
  'error',
  'fatal',
] as const

type LogLevelTuple = typeof LOG_LEVELS

export type LogLevel = LogLevelTuple[number]

export const logSettingSchema = z.object({
  level: z.enum(LOG_LEVELS),
  max_size: z
    .number({ invalid_type_error: 'Max size must be a number' })
    .min(0),
  max_files: z
    .number({ invalid_type_error: 'Max backups must be a number' })
    .min(1),
})
