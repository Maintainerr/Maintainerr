import { Global, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import chalk from 'chalk';
import type { TransformableInfo } from 'logform';
import path from 'path';
import { Repository } from 'typeorm';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOG_MAX_FILES,
  DEFAULT_LOG_MAX_SIZE,
  LogSettings,
} from './entities/logSettings.entities';
import { formatLogMessage, sanitizeLogInfo } from './logFormatting';
import { resolveLogLevel } from './logLevel';
import { LogsController } from './logs.controller';
import {
  LogSettingsService,
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from './logs.service';
import { EventEmitterTransport } from './winston/eventEmitterTransport';
import { installStdioPipeGuards } from './winston/stdioPipeGuard';

installStdioPipeGuards();

const dataDir =
  process.env.NODE_ENV === 'production'
    ? '/opt/data'
    : path.join(__dirname, '../../../../../data');

const sanitizeLogFormat = winston.format(
  (info): TransformableInfo => sanitizeLogInfo(info),
);

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LogSettings])],
  providers: [
    MaintainerrLogger,
    MaintainerrLoggerFactory,
    LogSettingsService,
    {
      provide: winston.Logger,
      inject: [getRepositoryToken(LogSettings), EventEmitter2],
      useFactory: async (
        logSettingsRepo: Repository<LogSettings>,
        eventEmitter: EventEmitter2,
      ) => {
        const logSettings = await logSettingsRepo.findOne({ where: {} });
        // LOG_LEVEL env var takes precedence over the persisted setting so
        // operators can change verbosity for a single container without
        // touching the database. The persisted setting is the user-facing UI
        // value; the env var is the ops-facing override. Defaults cover the
        // first-boot window before the log_settings row exists.
        const { level: resolvedLevel, invalidEnvValue } = resolveLogLevel(
          process.env.LOG_LEVEL,
          logSettings?.level ?? DEFAULT_LOG_LEVEL,
        );
        if (invalidEnvValue !== undefined) {
          // Surface the typo early; the winston logger does not exist yet here,
          // so console is the only channel.
          console.warn(
            `LOG_LEVEL=${JSON.stringify(invalidEnvValue)} is not a recognised level; using ${resolvedLevel}.`,
          );
        }
        const maxSize = `${logSettings?.max_size ?? DEFAULT_LOG_MAX_SIZE}m`;
        const maxFiles = `${logSettings?.max_files ?? DEFAULT_LOG_MAX_FILES}d`;

        const dailyRotateFileTransport = new DailyRotateFile({
          filename: path.join(dataDir, 'logs/maintainerr-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: maxSize,
          maxFiles: maxFiles,
          format: winston.format.combine(
            sanitizeLogFormat(),
            winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
            winston.format.printf(
              ({ level, message, timestamp, context, stack }) => {
                return `[maintainerr]  |  ${timestamp}  [${level.toUpperCase()}] [${context}] ${formatLogMessage(message, stack)}`;
              },
            ),
          ),
        });

        return winston.createLogger({
          level: resolvedLevel,
          levels: {
            fatal: 0,
            error: 1,
            warn: 2,
            info: 3,
            verbose: 4,
            debug: 5,
          },
          format: winston.format.combine(
            sanitizeLogFormat(),
            winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
            winston.format.printf(
              ({ level, message, timestamp, context, stack }) => {
                const coloredTimestamp = chalk.white(timestamp);

                const colouredMessage = (message) => {
                  return level === 'debug' || level === 'verbose'
                    ? chalk.gray(message)
                    : level === 'error' || level === 'fatal'
                      ? chalk.red(message)
                      : level === 'warn'
                        ? chalk.yellow(message)
                        : level === 'info'
                          ? chalk.green(message)
                          : chalk.cyan(message);
                };

                const formattedLevel = `[${level.toUpperCase()}]`;

                return `${chalk.green(`[maintainerr] |`)} ${coloredTimestamp}  ${colouredMessage(formattedLevel)} ${chalk.blue(`[${context}]`)} ${colouredMessage(formatLogMessage(message, stack))}`;
              },
            ),
          ),
          transports: [
            new winston.transports.Console(),
            dailyRotateFileTransport,
            new EventEmitterTransport(eventEmitter),
          ],
        });
      },
    },
  ],
  exports: [MaintainerrLogger, LogSettingsService, MaintainerrLoggerFactory],
  controllers: [LogsController],
})
export class LogsModule {}
