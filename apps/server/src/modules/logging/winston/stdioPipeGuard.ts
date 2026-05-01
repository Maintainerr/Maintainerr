const BROKEN_PIPE_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED']);

const isBrokenPipeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' && BROKEN_PIPE_CODES.has(code);
};

export type StdioStream = NodeJS.WriteStream & { __pipeGuarded?: boolean };

export const installStdioPipeGuard = (
  stream: StdioStream,
  onUnexpectedError?: (error: Error) => void,
): void => {
  if (stream.__pipeGuarded) return;
  stream.__pipeGuarded = true;

  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (isBrokenPipeError(error)) return;
    if (onUnexpectedError) {
      onUnexpectedError(error);
      return;
    }
    throw error;
  });
};

export const installStdioPipeGuards = (
  onUnexpectedError?: (error: Error) => void,
): void => {
  installStdioPipeGuard(process.stdout as StdioStream, onUnexpectedError);
  installStdioPipeGuard(process.stderr as StdioStream, onUnexpectedError);
};

export const __testing = { isBrokenPipeError };
