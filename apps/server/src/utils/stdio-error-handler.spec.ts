import { EventEmitter } from 'events';
import {
  attachStdioErrorHandler,
  createStdioErrorHandler,
} from './stdio-error-handler';

describe('stdio error handler', () => {
  it('ignores broken pipe errors', () => {
    const handler = createStdioErrorHandler();
    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
    });

    expect(() => handler(error)).not.toThrow();
  });

  it('rethrows unexpected stream errors by default', () => {
    const handler = createStdioErrorHandler();
    const error = new Error('boom');

    expect(() => handler(error)).toThrow(error);
  });

  it('allows custom handling for unexpected stream errors', () => {
    const onUnexpectedError = jest.fn();
    const handler = createStdioErrorHandler(onUnexpectedError);
    const error = new Error('boom');

    handler(error);

    expect(onUnexpectedError).toHaveBeenCalledWith(error);
  });

  it('attaches at most one handler per stream', () => {
    const stream = new EventEmitter() as unknown as Pick<
      NodeJS.WritableStream,
      'on'
    > &
      EventEmitter;

    attachStdioErrorHandler(stream);
    attachStdioErrorHandler(stream);

    expect(stream.listenerCount('error')).toBe(1);
  });

  it('prevents stream EPIPE events from surfacing as uncaught exceptions', () => {
    const stream = new EventEmitter() as unknown as Pick<
      NodeJS.WritableStream,
      'on'
    > &
      EventEmitter;
    attachStdioErrorHandler(stream);

    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
    });

    expect(() => stream.emit('error', error)).not.toThrow();
  });
});
