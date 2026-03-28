import { LogSetting } from '@maintainerr/contracts';
import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LogSettings } from './entities/logSettings.entities';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'verbose' | 'debug';
type LogMeta = Record<string, unknown>;

type NormalizedErrorDetails = {
  summary?: string;
  stack?: string;
  meta?: LogMeta;
};

type ObjectLogPayload = {
  message: string;
  meta?: LogMeta;
  stack?: string;
};

function isLogMeta(value: unknown): value is LogMeta {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class LogSettingsService {
  constructor(
    private readonly logger: winston.Logger,
    @InjectRepository(LogSettings)
    private readonly logSettingsRepo: Repository<LogSettings>,
  ) {}

  public async get(): Promise<LogSetting> {
    const logSetting = await this.logSettingsRepo.findOneOrFail({ where: {} });

    return {
      level: logSetting.level,
      max_size: logSetting.max_size,
      max_files: logSetting.max_files,
    };
  }

  public async update(settings: LogSetting): Promise<void> {
    this.logger.level = settings.level;

    const rotateTransport = this.logger.transports.find(
      (x): x is DailyRotateFile => x instanceof DailyRotateFile,
    );

    if (rotateTransport) {
      rotateTransport.options.maxFiles = settings.max_files;
      rotateTransport.options.maxSize = `${settings.max_size}m`;
    }

    const logSetting = await this.logSettingsRepo.findOne({ where: {} });

    const data = {
      ...logSetting,
      level: settings.level,
      max_size: settings.max_size,
      max_files: settings.max_files,
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

    if (message instanceof Error) {
      return this.writeErrorInstance('info', message, context);
    }

    if (!!message && typeof message === 'object') {
      const { level = 'info', ...payload } = message;
      const normalizedPayload = this.normalizeObjectLogPayload(payload);

      return this.writeStructuredLog(
        level,
        normalizedPayload.message,
        context,
        normalizedPayload.meta,
        normalizedPayload.stack,
      );
    }

    return this.logger.info(message, { context });
  }

  private getActiveContext(context?: string): string | undefined {
    return context || this.context;
  }

  private normalizeErrorDetails(error: unknown): NormalizedErrorDetails {
    if (error instanceof Error) {
      const errorWithMeta = error as Error & {
        code?: unknown;
        status?: unknown;
        statusText?: unknown;
        response?: { status?: unknown; statusText?: unknown };
      };

      const meta: LogMeta = {};

      if (typeof errorWithMeta.name === 'string' && errorWithMeta.name !== '') {
        meta.errorName = errorWithMeta.name;
      }

      if (typeof errorWithMeta.code === 'string') {
        meta.errorCode = errorWithMeta.code;
      }

      const status =
        typeof errorWithMeta.response?.status === 'number'
          ? errorWithMeta.response.status
          : typeof errorWithMeta.status === 'number'
            ? errorWithMeta.status
            : undefined;

      if (status !== undefined) {
        meta.status = status;
      }

      const statusText =
        typeof errorWithMeta.response?.statusText === 'string'
          ? errorWithMeta.response.statusText
          : typeof errorWithMeta.statusText === 'string'
            ? errorWithMeta.statusText
            : undefined;

      if (statusText) {
        meta.statusText = statusText;
      }

      const summaryParts = [error.message];
      if (typeof meta.errorCode === 'string') {
        summaryParts.push(`code=${meta.errorCode}`);
      }
      if (typeof meta.status === 'number') {
        summaryParts.push(
          `status=${meta.status}${statusText ? ` ${statusText}` : ''}`,
        );
      }

      return {
        summary: summaryParts.filter(Boolean).join(' | '),
        stack: error.stack,
        meta,
      };
    }

    if (typeof error === 'string' && error !== '') {
      return { summary: error };
    }

    if (isLogMeta(error)) {
      const meta: LogMeta = {};
      for (const key of ['name', 'code', 'status', 'statusText']) {
        const value = error[key];
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          meta[`error${key.charAt(0).toUpperCase()}${key.slice(1)}`] = value;
        }
      }

      return {
        summary:
          typeof error.message === 'string' && error.message !== ''
            ? error.message
            : undefined,
        stack: typeof error.stack === 'string' ? error.stack : undefined,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      };
    }

    return {};
  }

  private writeStructuredLog(
    level: LogLevel,
    message: string,
    context: string | undefined,
    meta?: LogMeta,
    stack?: string,
  ): any {
    return this.logger.log({
      level,
      message,
      context,
      ...(stack ? { stack: [stack] } : {}),
      ...(meta ?? {}),
    });
  }

  private mergeMeta(...metas: Array<LogMeta | undefined>): LogMeta | undefined {
    const merged = Object.assign({}, ...metas.filter(Boolean));
    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private sanitizeMessagePrefix(message: string): string {
    const trimmed = message.trimEnd();
    return trimmed.endsWith('.') || trimmed.endsWith(':')
      ? trimmed.slice(0, -1)
      : trimmed;
  }

  private normalizeObjectLogPayload(
    payload: LogMeta,
    explicitStack?: string,
  ): ObjectLogPayload {
    const { message, error, ...meta } = payload as LogMeta & {
      message?: unknown;
      error?: unknown;
    };

    const resolvedMessage =
      typeof message === 'string' ? message : String(message ?? '');
    const embeddedError = error;

    if (embeddedError === undefined) {
      return {
        message: resolvedMessage,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
        stack: explicitStack,
      };
    }

    const normalizedError = this.normalizeErrorDetails(embeddedError);

    return {
      message: normalizedError.summary
        ? `${resolvedMessage}: ${normalizedError.summary}`
        : resolvedMessage,
      meta: this.mergeMeta(meta, normalizedError.meta),
      stack: explicitStack ?? normalizedError.stack,
    };
  }

  private writeMessageWithError(
    level: LogLevel,
    message: string,
    error: unknown,
    context?: string,
    meta?: LogMeta,
  ): any {
    const normalizedError = this.normalizeErrorDetails(error);
    const resolvedMessage = normalizedError.summary
      ? `${this.sanitizeMessagePrefix(message)}: ${normalizedError.summary}`
      : message;

    return this.writeStructuredLog(
      level,
      resolvedMessage,
      context,
      this.mergeMeta(meta, normalizedError.meta),
      normalizedError.stack,
    );
  }

  private writeErrorInstance(
    level: LogLevel,
    error: Error,
    context?: string,
    meta?: LogMeta,
  ): any {
    const normalizedError = this.normalizeErrorDetails(error);

    return this.writeStructuredLog(
      level,
      normalizedError.summary ?? error.message,
      context,
      this.mergeMeta(meta, normalizedError.meta),
      normalizedError.stack,
    );
  }

  public fatal(
    message: any,
    errorOrTrace?: unknown,
    contextOrMeta?: string | LogMeta,
    metaArg?: LogMeta,
  ): any {
    const context =
      typeof contextOrMeta === 'string'
        ? this.getActiveContext(contextOrMeta)
        : this.getActiveContext();

    if (message instanceof Error) {
      return this.writeErrorInstance(
        'fatal',
        message,
        context,
        this.mergeMeta(
          typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
          { errorName: message.name },
        ),
      );
    }

    if (!!message && typeof message === 'object') {
      const normalizedPayload = this.normalizeObjectLogPayload(
        message,
        typeof errorOrTrace === 'string' ? errorOrTrace : undefined,
      );
      return this.writeStructuredLog(
        'fatal',
        normalizedPayload.message,
        context,
        normalizedPayload.meta,
        normalizedPayload.stack,
      );
    }

    if (
      typeof errorOrTrace === 'string' &&
      (contextOrMeta === undefined || typeof contextOrMeta === 'string') &&
      metaArg === undefined
    ) {
      return this.writeStructuredLog(
        'fatal',
        message,
        context,
        undefined,
        errorOrTrace,
      );
    }

    return this.writeMessageWithError(
      'fatal',
      message,
      errorOrTrace,
      context,
      typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
    );
  }

  public error(
    message: any,
    errorOrTrace?: unknown,
    contextOrMeta?: string | LogMeta,
    metaArg?: LogMeta,
  ): any {
    const context =
      typeof contextOrMeta === 'string'
        ? this.getActiveContext(contextOrMeta)
        : this.getActiveContext();

    if (message instanceof Error) {
      return this.writeErrorInstance(
        'error',
        message,
        context,
        typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
      );
    }

    if (!!message && typeof message == 'object') {
      const normalizedPayload = this.normalizeObjectLogPayload(
        message,
        typeof errorOrTrace === 'string' ? errorOrTrace : undefined,
      );
      return this.writeStructuredLog(
        'error',
        normalizedPayload.message,
        context,
        normalizedPayload.meta,
        normalizedPayload.stack,
      );
    }

    if (
      typeof errorOrTrace === 'string' &&
      (contextOrMeta === undefined || typeof contextOrMeta === 'string') &&
      metaArg === undefined
    ) {
      return this.writeStructuredLog(
        'error',
        message,
        context,
        undefined,
        errorOrTrace,
      );
    }

    return this.writeMessageWithError(
      'error',
      message,
      errorOrTrace,
      context,
      typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
    );
  }

  public warn(
    message: any,
    errorOrContext?: unknown,
    contextOrMeta?: string | LogMeta,
    metaArg?: LogMeta,
  ): any {
    const isLegacyContextOnly =
      typeof errorOrContext === 'string' &&
      contextOrMeta === undefined &&
      metaArg === undefined;

    const context = this.getActiveContext(
      isLegacyContextOnly
        ? (errorOrContext as string)
        : typeof contextOrMeta === 'string'
          ? contextOrMeta
          : undefined,
    );

    if (message instanceof Error) {
      return this.writeErrorInstance(
        'warn',
        message,
        context,
        typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
      );
    }

    if (!!message && typeof message === 'object') {
      const normalizedPayload = this.normalizeObjectLogPayload(message);
      return this.writeStructuredLog(
        'warn',
        normalizedPayload.message,
        context,
        normalizedPayload.meta,
        normalizedPayload.stack,
      );
    }

    if (isLegacyContextOnly) {
      return this.writeStructuredLog('warn', message, context);
    }

    return this.writeMessageWithError(
      'warn',
      message,
      errorOrContext,
      context,
      typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
    );
  }

  public debug(
    message: any,
    errorOrContext?: unknown,
    contextOrMeta?: string | LogMeta,
    metaArg?: LogMeta,
  ): any {
    const isLegacyContextOnly =
      typeof errorOrContext === 'string' &&
      contextOrMeta === undefined &&
      metaArg === undefined;

    const context = this.getActiveContext(
      isLegacyContextOnly
        ? (errorOrContext as string)
        : typeof contextOrMeta === 'string'
          ? contextOrMeta
          : undefined,
    );

    if (message instanceof Error) {
      return this.writeErrorInstance(
        'debug',
        message,
        context,
        typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
      );
    }

    if (!!message && typeof message === 'object') {
      const normalizedPayload = this.normalizeObjectLogPayload(message);
      return this.writeStructuredLog(
        'debug',
        normalizedPayload.message,
        context,
        normalizedPayload.meta,
        normalizedPayload.stack,
      );
    }

    if (isLegacyContextOnly) {
      return this.writeStructuredLog('debug', message, context);
    }

    return this.writeMessageWithError(
      'debug',
      message,
      errorOrContext,
      context,
      typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
    );
  }

  public verbose?(
    message: any,
    errorOrContext?: unknown,
    contextOrMeta?: string | LogMeta,
    metaArg?: LogMeta,
  ): any {
    const isLegacyContextOnly =
      typeof errorOrContext === 'string' &&
      contextOrMeta === undefined &&
      metaArg === undefined;

    const context = this.getActiveContext(
      isLegacyContextOnly
        ? (errorOrContext as string)
        : typeof contextOrMeta === 'string'
          ? contextOrMeta
          : undefined,
    );

    if (message instanceof Error) {
      return this.writeErrorInstance(
        'verbose',
        message,
        context,
        typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
      );
    }

    if (!!message && typeof message === 'object') {
      const normalizedPayload = this.normalizeObjectLogPayload(message);
      return this.writeStructuredLog(
        'verbose',
        normalizedPayload.message,
        context,
        normalizedPayload.meta,
        normalizedPayload.stack,
      );
    }

    if (isLegacyContextOnly) {
      return this.writeStructuredLog('verbose', message, context);
    }

    return this.writeMessageWithError(
      'verbose',
      message,
      errorOrContext,
      context,
      typeof contextOrMeta === 'string' ? metaArg : contextOrMeta,
    );
  }
}
