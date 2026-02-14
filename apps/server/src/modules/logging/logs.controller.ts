import {
  LogEvent,
  LogFile,
  LogSetting,
  logSettingSchema,
} from '@maintainerr/contracts';
import {
  BeforeApplicationShutdown,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  MessageEvent as NestMessageEvent,
  Param,
  Post,
  RawBodyRequest,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ZodValidationPipe } from 'nestjs-zod';
import { Response } from 'express';
import { createReadStream, readdir } from 'fs';
import { readdir as readdirp, stat } from 'fs/promises';
import { IncomingMessage } from 'http';
import mime from 'mime-types';
import path from 'path';
import readLastLines from 'read-last-lines';
import {
  catchError,
  concat,
  filter,
  from,
  fromEvent,
  interval,
  map,
  mergeMap,
  of,
  Subject,
  switchMap,
} from 'rxjs';
import { Readable } from 'stream';
import { formatLogMessage } from './logFormatting';
import { LogSettingsService } from './logs.service';

const logsDirectory =
  process.env.NODE_ENV === 'production'
    ? '/opt/data/logs'
    : path.join(__dirname, `../../../../../data/logs`);

const safeLogFileRegex = /maintainerr-\d{4}-\d{2}-\d{2}\.log(\.gz)?/;

@Controller('/api/logs')
export class LogsController implements BeforeApplicationShutdown {
  constructor(
    private readonly logSettingsService: LogSettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  connectedClients = new Map<
    string,
    { close: () => void; subject: Subject<NestMessageEvent> }
  >();

  async beforeApplicationShutdown() {
    for (const [, client] of this.connectedClients) {
      client.close();
    }
  }

  // Source: https://github.com/nestjs/nest/issues/12670
  @Get('stream')
  async stream(
    @Res() response: Response,
    @Req() request: RawBodyRequest<IncomingMessage>,
  ) {
    if (request?.socket) {
      request.socket.setKeepAlive(true);
      request.socket.setNoDelay(true);
      request.socket.setTimeout(0);
    }

    const subject = new Subject<NestMessageEvent>();

    const observer = {
      next: (msg: NestMessageEvent) => {
        if (msg.type) response.write(`event: ${msg.type}\n`);
        if (msg.id) response.write(`id: ${msg.id}\n`);
        if (msg.retry) response.write(`retry: ${msg.retry}\n`);

        response.write(`data: ${JSON.stringify(msg.data)}\n\n`);
      },
    };

    subject.subscribe(observer);

    const clientKey = String(Math.random());
    this.connectedClients.set(clientKey, {
      close: () => {
        response.end();
      },
      subject,
    });

    response.on('close', () => {
      subject.complete();
      pingSubscription.unsubscribe();
      logEventStreamSubscription.unsubscribe();
      this.connectedClients.delete(clientKey);
      response.end();
    });

    response.set({
      'Cache-Control':
        'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    });

    response.flushHeaders();
    response.write('\n');

    const currentLogFile = new Promise<string | undefined>(
      (resolve, reject) => {
        readdir(logsDirectory, (err, files) => {
          if (err) {
            reject(err);
            return;
          } else {
            const currentLogFile = files
              .filter((x) => x.endsWith('.log'))
              .sort()
              .reverse()?.[0];

            if (!currentLogFile) {
              resolve(undefined);
              return;
            }

            const filePath = path.join(logsDirectory, currentLogFile);
            resolve(filePath);
          }
        });
      },
    );

    const currentLogFileRecentLines = from(currentLogFile).pipe(
      switchMap((file) =>
        file ? from(readLastLines.read(file, 200)) : of(''),
      ),
      catchError(() => of('')),
    );

    const strToDate = (dtStr: string) => {
      if (!dtStr) return null;

      const dateParts = dtStr.split('/');
      const timeParts = dateParts[2].split(' ')[1].split(':');
      dateParts[2] = dateParts[2].split(' ')[0];

      return new Date(
        +dateParts[2],
        +dateParts[1] - 1,
        +dateParts[0],
        +timeParts[0],
        +timeParts[1],
        +timeParts[2],
      );
    };

    const parseLogLine = (line: string): LogEvent | null => {
      const regex =
        /\[(?<context>[^\]]+)\]  \|  (?<timestamp>[^\[]+)  \[(?<level>[^\]]+)\] \[(?<label>[^\]]+)\] (?<message>.*)/s;

      const match = line.match(regex);

      if (!match) {
        return null;
      }

      const date = strToDate(match.groups.timestamp);
      const level = match.groups.level;
      const message = match.groups.message;
      return {
        date,
        level,
        message,
      };
    };

    const logEvents = fromEvent(this.eventEmitter, 'log').pipe(
      map((info: any) => {
        return {
          date: strToDate(info.timestamp),
          level: info.level.toUpperCase(),
          message: info.message,
          ...(info.stack && { stack: info.stack }),
        };
      }),
    );

    const logEventStream = concat(
      from(currentLogFileRecentLines).pipe(
        filter((x) => x !== ''),
        mergeMap((data: string) => {
          const logFileRegex = /\[maintainerr\].*?(?=\[maintainerr\]|\Z)/gs;
          const matches = data.match(logFileRegex) ?? [];
          const events: MessageEvent[] = [];

          for (const match of matches) {
            const logEvent = parseLogLine(match);

            if (!logEvent) {
              continue;
            }

            const event = new MessageEvent<LogEvent>('log', { data: logEvent });
            events.push(event);
          }

          return events;
        }),
      ),
      from(logEvents).pipe(
        map((data) => {
          const event = new MessageEvent<LogEvent>('log', {
            data: {
              date: data.date,
              level: data.level,
              message: formatLogMessage(data.message, data.stack),
            },
          });

          return event;
        }),
      ),
    );

    const logEventStreamSubscription = logEventStream
      .pipe(map((x) => this.sendDataToClient(clientKey, x)))
      .subscribe();

    // Send data to the client every 30s to keep the connection alive
    const pingSubscription = interval(30 * 1000)
      .pipe(map(() => response.write(': ping\n\n')))
      .subscribe();
  }

  sendDataToClient(clientId: string, message: NestMessageEvent) {
    this.connectedClients.get(clientId)?.subject.next(message);
  }

  @Get('files')
  async getFiles(): Promise<LogFile[]> {
    const files = (await readdirp(logsDirectory))
      .filter((x) => safeLogFileRegex.test(x))
      .sort();
    const response: LogFile[] = [];

    for (const file of files) {
      const stat2 = await stat(path.join(logsDirectory, file));
      response.push({
        name: file,
        size: stat2.size,
      });
    }

    return response;
  }

  @Get('files/:file')
  async getFile(@Param('file') file: string) {
    if (!safeLogFileRegex.test(file)) {
      throw new HttpException('Invalid file', HttpStatus.BAD_REQUEST);
    }

    const filePath = path.join(logsDirectory, file);
    const fileMimeType = mime.lookup(filePath);
    const fileStream: Readable = createReadStream(filePath);

    return new StreamableFile(fileStream, {
      type: fileMimeType !== false ? fileMimeType : 'application/octet-stream',
      disposition: `attachment; filename="${file}"`,
    });
  }

  @Get('settings')
  async getLogSettings(): Promise<LogSetting> {
    return await this.logSettingsService.get();
  }

  @Post('settings')
  async setLogSettings(
    @Body(new ZodValidationPipe(logSettingSchema)) payload: LogSetting,
  ) {
    return await this.logSettingsService.update(payload);
  }
}
