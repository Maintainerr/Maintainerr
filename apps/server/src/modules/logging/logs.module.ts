import { Global, Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import chalk from 'chalk';
import path from 'path';
import { Repository } from 'typeorm';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LogSettings } from './entities/logSettings.entities';
import { formatLogMessage } from './logFormatting';
import { LogsController } from './logs.controller';
import {
  LogSettingsService,
  MaintainerrLogger,
  MaintainerrLoggerFactory,
} from './logs.service';
import { EventEmitterTransport } from './winston/eventEmitterTransport';

const dataDir =
  process.env.NODE_ENV === 'production'
    ? '/opt/data'
    : path.join(__dirname, '../../../../../data');

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
        const maxSize = `${logSettings.max_size}m`;
        const maxFiles = `${logSettings.max_files}d`;

        const dailyRotateFileTransport = new DailyRotateFile({
          filename: path.join(dataDir, 'logs/maintainerr-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: maxSize,
          maxFiles: maxFiles,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
            winston.format.printf(
              ({ level, message, timestamp, context, stack }) => {
                return `[maintainerr]  |  ${timestamp}  [${level.toUpperCase()}] [${context}] ${formatLogMessage(message, stack)}`;
              },
            ),
          ),
        });

        return winston.createLogger({
          level: logSettings.level,
          levels: {
            fatal: 0,
            error: 1,
            warn: 2,
            info: 3,
            verbose: 4,
            debug: 5,
          },
          format: winston.format.combine(
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
