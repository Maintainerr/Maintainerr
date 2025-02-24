import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  MessageEvent as NestMessageEvent,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  concat,
  from,
  map,
  switchMap,
  fromEvent,
  Subject,
  filter,
  mergeMap,
  catchError,
} from 'rxjs';
import path from 'path';
import readLastLines from 'read-last-lines';
import { createReadStream, readdir } from 'fs';
import { readdir as readdirp, stat } from 'fs/promises';
import mime from 'mime-types';
import { LogSettingsService } from './logs.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogFile, LogSettingDto, LogEvent } from '@maintainerr/contracts';
import { Readable } from 'stream';
import { Response } from 'express';
import { formatLogMessage } from './logFormatting';

const logsDirectory = path.join(__dirname, `../../../../data/logs`);
const safeLogFileRegex = /maintainerr-\d{4}-\d{2}-\d{2}\.log(\.gz)?/;

@Controller('/api/logs')
export class LogsController {
  constructor(
    private readonly logSettingsService: LogSettingsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  connectedClients = new Map<
    string,
    { close: () => void; subject: Subject<NestMessageEvent> }
  >();

  // Source: https://github.com/nestjs/nest/issues/12670
  @Get('stream')
  async stream(@Res() response: Response) {
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

    const currentLogFile = new Promise<string | undefined>(
      (resolve, reject) => {
        readdir(logsDirectory, (err, files) => {
          if (err) {
            reject(err);
          } else {
            const currentLogFile = files
              .filter((x) => x.endsWith('.log'))
              .sort()
              .reverse()?.[0];

            if (!currentLogFile) {
              reject("Couldn't find any log files");
            }

            const filePath = path.join(logsDirectory, currentLogFile);
            resolve(filePath);
          }
        });
      },
    );

    const currentLogFileRecentLines = from(currentLogFile).pipe(
      switchMap((file) => from(readLastLines.read(file, 200))),
      catchError(() => {
        return '';
      }),
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

    const parseLogLine = (line: string): LogEvent => {
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
  async getLogSettings(): Promise<LogSettingDto> {
    return await this.logSettingsService.get();
  }

  @Post('settings')
  async setLogSettings(@Body() payload: LogSettingDto) {
    return await this.logSettingsService.update(payload);
  }
}
