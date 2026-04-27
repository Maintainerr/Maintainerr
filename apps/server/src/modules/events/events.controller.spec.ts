import {
  MessageEvent as NestMessageEvent,
  RawBodyRequest,
} from '@nestjs/common';
import { Response } from 'express';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { createMockLogger } from '../../../test/utils/data';
import { EventsBufferService } from './events-buffer.service';
import { EventsController } from './events.controller';

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
    headers: {},
    socket: new MockSocket(),
  }) as unknown as RawBodyRequest<IncomingMessage>;

describe('EventsController', () => {
  it('removes SSE clients when writing to a closed stream fails', async () => {
    const eventsBufferService = {
      parseLastEventId: jest.fn().mockReturnValue(undefined),
      getEventsAfter: jest.fn().mockReturnValue([]),
      buildBufferedEvent: jest.fn().mockImplementation(
        (message: Omit<NestMessageEvent, 'id'>): NestMessageEvent => ({
          ...message,
          id: '1',
        }),
      ),
    } as unknown as jest.Mocked<EventsBufferService>;
    const controller = new EventsController(
      eventsBufferService,
      createMockLogger(),
    );
    const response = new MockResponse();

    await controller.stream(response as unknown as Response, buildRequest());

    const clientId = [...controller.connectedClients.keys()][0];
    const epipeError = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
    });
    response.write.mockImplementationOnce(() => {
      throw epipeError;
    });

    expect(() =>
      controller.sendDataToClient(clientId, {
        type: 'test.event',
        data: { ok: true },
      }),
    ).not.toThrow();
    expect(controller.connectedClients.size).toBe(0);
  });
});
