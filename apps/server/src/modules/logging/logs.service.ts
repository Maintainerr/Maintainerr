import { LogSettingDto, logSettingSchema } from '@maintainerr/contracts';
import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LogSettings } from './entities/logSettings.entities';

@Injectable()
export class LogSettingsService {
  constructor(
    private readonly logger: winston.Logger,
    @InjectRepository(LogSettings)
    private readonly logSettingsRepo: Repository<LogSettings>,
  ) {}

  public async get(): Promise<LogSettingDto> {
    const logSetting = await this.logSettingsRepo.findOneOrFail({ where: {} });

    return {
      level: logSetting.level,
      max_size: logSetting.max_size,
      max_files: logSetting.max_files,
    };
  }

  public async update(settings: LogSettingDto): Promise<void> {
    const parsedSettings = logSettingSchema.parse(settings);

    this.logger.level = parsedSettings.level;

    const rotateTransport = this.logger.transports.find(
      (x): x is DailyRotateFile => x instanceof DailyRotateFile,
    );

    if (rotateTransport) {
      rotateTransport.options.maxFiles = parsedSettings.max_files;
      rotateTransport.options.maxSize = `${parsedSettings.max_size}m`;
    }

    const logSetting = await this.logSettingsRepo.findOne({ where: {} });

    const data = {
      ...logSetting,
      level: parsedSettings.level,
      max_size: parsedSettings.max_size,
      max_files: parsedSettings.max_files,
    } satisfies LogSettings;

    await this.logSettingsRepo.save(data);
  }
}

@Injectable()
export class MaintainerrLoggerFactory {
  constructor(private readonly logger: winston.Logger) {}

  public createLogger(context?: string): MaintainerrLogger {
    const logger = new MaintainerrLogger(this.logger);
    if (context) {
      logger.setContext(context);
    }
    return logger;
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class MaintainerrLogger implements LoggerService {
  private context?: string;

  constructor(private readonly logger: winston.Logger) {}

  public setContext(context: string) {
    this.context = context;
  }

  public log(message: any, context?: string): any {
    context = context || this.context;

    if (!!message && typeof message === 'object') {
      const { message: msg, level = 'info', ...meta } = message;

      return this.logger.log(level, msg as string, { context, ...meta });
    }

    return this.logger.info(message, { context });
  }

  public fatal(message: any, trace?: string, context?: string): any {
    context = context || this.context;

    if (message instanceof Error) {
      const { message: msg, stack, ...meta } = message;

      return this.logger.log({
        level: 'fatal',
        message: msg,
        context,
        stack: [trace || stack],
        error: message,
        ...meta,
      });
    }

    if (!!message && typeof message === 'object') {
      const { message: msg, ...meta } = message;

      return this.logger.log({
        level: 'fatal',
        message: msg,
        context,
        stack: [trace],
        ...meta,
      });
    }

    return this.logger.log({
      level: 'fatal',
      message,
      context,
      stack: [trace],
    });
  }

  public error(message: any, trace?: string, context?: string): any {
    context = context || this.context;

    if (message instanceof Error) {
      const { message: msg, stack, ...meta } = message;

      return this.logger.error(msg, {
        context,
        stack: [trace || stack],
        error: message,
        ...meta,
      });
    }

    if (!!message && typeof message == 'object') {
      const { message: msg, ...meta } = message;

      return this.logger.error(msg as string, {
        context,
        stack: [trace],
        ...meta,
      });
    }

    return this.logger.error(message, { context, stack: [trace] });
  }

  public warn(message: any, context?: string): any {
    context = context || this.context;

    if (!!message && typeof message === 'object') {
      const { message: msg, ...meta } = message;

      return this.logger.warn(msg as string, { context, ...meta });
    }

    return this.logger.warn(message, { context });
  }

  public debug?(message: any, context?: string): any {
    context = context || this.context;

    if (!!message && typeof message === 'object') {
      const { message: msg, ...meta } = message;

      return this.logger.debug(msg as string, { context, ...meta });
    }

    return this.logger.debug(message, { context });
  }

  public verbose?(message: any, context?: string): any {
    context = context || this.context;

    if (!!message && typeof message === 'object') {
      const { message: msg, ...meta } = message;

      return this.logger.verbose(msg as string, { context, ...meta });
    }

    return this.logger.verbose(message, { context });
  }
}
