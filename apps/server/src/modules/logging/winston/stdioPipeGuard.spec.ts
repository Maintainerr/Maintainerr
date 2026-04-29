import { EventEmitter } from 'events';
import {
  installStdioPipeGuard,
  StdioStream,
  __testing,
} from './stdioPipeGuard';

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
  describe('isBrokenPipeError', () => {
    it.each(['EPIPE', 'ERR_STREAM_DESTROYED'])(
      'classifies %s as a broken pipe error',
      (code) => {
        expect(__testing.isBrokenPipeError(makeError(code))).toBe(true);
      },
    );

    it.each([
      ['ENOSPC', makeError('ENOSPC')],
      ['no code', new Error('boom')],
      ['null', null],
      ['string', 'EPIPE'],
    ])('rejects %s as a non-broken-pipe error', (_label, value) => {
      expect(__testing.isBrokenPipeError(value)).toBe(false);
    });
  });

  describe('installStdioPipeGuard', () => {
    it('swallows EPIPE without invoking the unexpected-error handler', () => {
      const stream = makeStream();
      const onUnexpected = jest.fn();
      installStdioPipeGuard(stream, onUnexpected);

      expect(() => stream.emit('error', makeError('EPIPE'))).not.toThrow();
      expect(onUnexpected).not.toHaveBeenCalled();
    });

    it('swallows ERR_STREAM_DESTROYED without invoking the handler', () => {
      const stream = makeStream();
      const onUnexpected = jest.fn();
      installStdioPipeGuard(stream, onUnexpected);

      expect(() =>
        stream.emit('error', makeError('ERR_STREAM_DESTROYED')),
      ).not.toThrow();
      expect(onUnexpected).not.toHaveBeenCalled();
    });

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

      expect(() => stream.emit('error', makeError('ENOSPC'))).toThrow(
        /ENOSPC/,
      );
    });

    it('is idempotent: re-installing does not double-attach listeners', () => {
      const stream = makeStream();
      const onUnexpected = jest.fn();
      installStdioPipeGuard(stream, onUnexpected);
      installStdioPipeGuard(stream, onUnexpected);

      stream.emit('error', makeError('ENOSPC'));

      expect(onUnexpected).toHaveBeenCalledTimes(1);
    });
  });
});
