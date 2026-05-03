import { EventEmitter } from 'events';
import { Response } from 'express';
import { createSseStreamClient } from './sse-stream';

type WriteCallback = (error?: Error | null) => void;

class MockSocket extends EventEmitter {}

class MockResponse extends EventEmitter {
  destroyed = false;
  socket = new MockSocket();
  writableEnded = false;

  end = jest.fn(() => {
    this.writableEnded = true;
  });

  write = jest.fn((_chunk: string, callback?: WriteCallback) => {
    callback?.(null);
    return true;
  });
}

const makeEpipeError = (): NodeJS.ErrnoException =>
  Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

const waitForImmediate = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe('createSseStreamClient', () => {
  it('guards late response errors after an asynchronous write failure', async () => {
    const response = new MockResponse();
    const onClose = jest.fn();
    const onError = jest.fn();
    const client = createSseStreamClient({
      response: response as unknown as Response,
      onClose,
      onError,
    });
    const epipeError = makeEpipeError();

    response.write.mockImplementation(
      (_chunk: string, callback?: WriteCallback) => {
        setImmediate(() => callback?.(epipeError));
        return true;
      },
    );

    expect(client.send({ type: 'log', data: { ok: true } })).toBe(true);
    await waitForImmediate();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(response.listenerCount('error')).toBe(1);
    expect(() => response.emit('error', epipeError)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);

    response.emit('close');

    expect(response.listenerCount('error')).toBe(0);
  });

  it('keeps socket errors guarded between explicit close and response close', () => {
    const response = new MockResponse();
    const onClose = jest.fn();
    const onError = jest.fn();
    const client = createSseStreamClient({
      response: response as unknown as Response,
      onClose,
      onError,
    });
    const epipeError = makeEpipeError();

    client.close();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(() => response.socket.emit('error', epipeError)).not.toThrow();
    expect(onError).not.toHaveBeenCalled();

    response.emit('close');

    expect(response.socket.listenerCount('error')).toBe(0);
  });
});
