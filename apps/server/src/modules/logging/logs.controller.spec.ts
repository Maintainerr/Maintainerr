import {
  MessageEvent as NestMessageEvent,
  RawBodyRequest,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response } from 'express';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { createMockLogger } from '../../../test/utils/data';
import { LogSettingsService } from './logs.service';
import { LogsController } from './logs.controller';

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

describe('LogsController', () => {
  it('removes SSE clients when writing a log event to a closed stream fails', async () => {
    const eventEmitter = new EventEmitter2();
    const controller = new LogsController(
      {} as unknown as LogSettingsService,
      eventEmitter,
      createMockLogger(),
    );
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
});
