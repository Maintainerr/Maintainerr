import {
  MessageEvent as NestMessageEvent,
  HttpException,
  HttpStatus,
  RawBodyRequest,
  StreamableFile,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response } from 'express';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import { lstat, realpath } from 'fs/promises';
import { IncomingMessage } from 'http';
import { PassThrough } from 'stream';
import { createMockLogger } from '../../../test/utils/data';
import { LogSettingsService } from './logs.service';
import { LogsController } from './logs.controller';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    createReadStream: jest.fn(),
    readdir: jest.fn(
      (
        _dir: string,
        callback: (
          error: NodeJS.ErrnoException | null,
          files: string[],
        ) => void,
      ) => {
        callback(null, []);
      },
    ),
  };
});

jest.mock('fs/promises', () => {
  const actual = jest.requireActual('fs/promises');
  return {
    ...actual,
    lstat: jest.fn(),
    readdir: jest.fn(),
    realpath: jest.fn(),
    stat: jest.fn(),
  };
});

const createReadStreamMock = fs.createReadStream as jest.MockedFunction<
  typeof fs.createReadStream
>;

const lstatMock = jest.mocked(lstat);
const realpathMock = jest.mocked(realpath);

class MockSocket extends EventEmitter {
  setKeepAlive = jest.fn();
  setNoDelay = jest.fn();
  setTimeout = jest.fn();
}

class MockResponse extends EventEmitter {
  destroyed = false;
  socket = new MockSocket();
  writableEnded = false;

  end = jest.fn(() => {
    this.writableEnded = true;
  });

  flushHeaders = jest.fn();
  set = jest.fn();
  write = jest.fn(
    (_chunk: string, callback?: (error?: Error | null) => void) => {
      callback?.(null);
      return true;
    },
  );
}

const buildRequest = (): RawBodyRequest<IncomingMessage> =>
  ({
    socket: new MockSocket(),
  }) as unknown as RawBodyRequest<IncomingMessage>;

const createController = () =>
  new LogsController(
    {} as unknown as LogSettingsService,
    new EventEmitter2(),
    createMockLogger(),
  );

describe('LogsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes SSE clients when writing a log event to a closed stream fails', async () => {
    const controller = createController();
    const response = new MockResponse();

    await controller.stream(response as unknown as Response, buildRequest());

    const epipeError = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
    });
    response.write.mockImplementationOnce(() => {
      throw epipeError;
    });

    const clientId = [...controller.connectedClients.keys()][0];
    const message: NestMessageEvent = {
      type: 'log',
      data: {
        date: new Date('2026-04-27T00:01:28.000Z'),
        level: 'INFO',
        message: 'Overlay processor started',
      },
    };

    expect(() => controller.sendDataToClient(clientId, message)).not.toThrow();
    expect(controller.connectedClients.size).toBe(0);
  });

  it('rejects filenames that only contain a valid log filename as a substring', async () => {
    const controller = createController();

    await controller
      .getFile('maintainerr-2026-04-28.log.bak')
      .catch((error: HttpException) => {
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.message).toBe('Invalid file');
      });

    expect(lstatMock).not.toHaveBeenCalled();
    expect(realpathMock).not.toHaveBeenCalled();
    expect(createReadStreamMock).not.toHaveBeenCalled();
  });

  it('rejects symlinked log files before opening the stream', async () => {
    const controller = createController();
    lstatMock.mockResolvedValue({
      isFile: () => false,
      isSymbolicLink: () => true,
    } as Awaited<ReturnType<typeof lstat>>);

    await controller
      .getFile('maintainerr-2026-04-28.log')
      .catch((error: HttpException) => {
        expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(error.message).toBe('Invalid file');
      });

    expect(realpathMock).not.toHaveBeenCalled();
    expect(createReadStreamMock).not.toHaveBeenCalled();
  });

  it('streams regular log files from the resolved canonical path', async () => {
    const controller = createController();
    const stream = new PassThrough();
    lstatMock.mockResolvedValue({
      isFile: () => true,
      isSymbolicLink: () => false,
    } as Awaited<ReturnType<typeof lstat>>);
    realpathMock
      .mockResolvedValueOnce('/workspaces/Maintainerr/data/logs')
      .mockResolvedValueOnce(
        '/workspaces/Maintainerr/data/logs/maintainerr-2026-04-28.log',
      );
    createReadStreamMock.mockReturnValue(
      stream as unknown as ReturnType<typeof fs.createReadStream>,
    );

    const response = await controller.getFile('maintainerr-2026-04-28.log');

    expect(response).toBeInstanceOf(StreamableFile);
    expect(createReadStreamMock).toHaveBeenCalledWith(
      '/workspaces/Maintainerr/data/logs/maintainerr-2026-04-28.log',
    );
  });
});
