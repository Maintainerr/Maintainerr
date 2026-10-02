import { EventEmitter } from 'events';
import { installStdioPipeGuard, StdioStream } from './stdioPipeGuard';

const makeStream = (): StdioStream => {
  const emitter = new EventEmitter() as unknown as StdioStream;
  return emitter;
};

const makeError = (code: string): NodeJS.ErrnoException => {
  const err = new Error(`write ${code}`) as NodeJS.ErrnoException;
  err.code = code;
  return err;
};

describe('stdioPipeGuard', () => {
  describe('installStdioPipeGuard', () => {
    it.each(['EPIPE', 'ERR_STREAM_DESTROYED'])(
      'swallows %s without invoking the unexpected-error handler',
      (code) => {
        const stream = makeStream();
        const onUnexpected = jest.fn();
        installStdioPipeGuard(stream, onUnexpected);

        expect(() => stream.emit('error', makeError(code))).not.toThrow();
        expect(onUnexpected).not.toHaveBeenCalled();
      },
    );

    it('forwards non-broken-pipe errors to the handler', () => {
      const stream = makeStream();
      const onUnexpected = jest.fn();
      installStdioPipeGuard(stream, onUnexpected);

      const err = makeError('ENOSPC');
      stream.emit('error', err);

      expect(onUnexpected).toHaveBeenCalledTimes(1);
      expect(onUnexpected).toHaveBeenCalledWith(err);
    });

    it('rethrows non-broken-pipe errors when no handler is provided', () => {
      const stream = makeStream();
      installStdioPipeGuard(stream);

      expect(() => stream.emit('error', makeError('ENOSPC'))).toThrow(/ENOSPC/);
    });
  });
});
