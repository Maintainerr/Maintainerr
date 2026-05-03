import { MessageEvent as NestMessageEvent } from '@nestjs/common';
import { Response } from 'express';

type SseStreamClientOptions = {
  response: Response;
  onClose: () => void;
  onError?: (error: unknown) => void;
};

export type SseStreamClient = {
  close: () => void;
  send: (message: NestMessageEvent) => boolean;
  writeRaw: (chunk: string) => boolean;
};

const isResponseWritable = (response: Response): boolean =>
  !response.destroyed && !response.writableEnded;

const formatSseMessage = (message: NestMessageEvent): string[] => {
  const chunks: string[] = [];

  if (message.type) chunks.push(`event: ${message.type}\n`);
  if (message.id) chunks.push(`id: ${message.id}\n`);
  if (message.retry) chunks.push(`retry: ${message.retry}\n`);

  chunks.push(`data: ${JSON.stringify(message.data)}\n\n`);

  return chunks;
};

export const createSseStreamClient = ({
  response,
  onClose,
  onError,
}: SseStreamClientOptions): SseStreamClient => {
  const socket = response.socket;
  let closed = false;
  let listenersDetached = false;

  const detachListeners = (): void => {
    if (listenersDetached) return;
    listenersDetached = true;
    response.off('close', handleClose);
    response.off('error', handleError);
    socket?.off('error', handleError);
  };

  const finish = (endResponse: boolean, detach = true): void => {
    if (closed) {
      if (detach) detachListeners();
      return;
    }

    closed = true;

    if (endResponse && isResponseWritable(response)) {
      try {
        response.end();
      } catch (error) {
        onError?.(error);
      }
    }

    onClose();

    if (detach) detachListeners();
  };

  const fail = (error: unknown): void => {
    if (closed) return;
    onError?.(error);
    finish(false, false);
  };

  const writeRaw = (chunk: string): boolean => {
    if (closed || !isResponseWritable(response)) {
      finish(false);
      return false;
    }

    try {
      response.write(chunk, (error?: Error | null) => {
        if (error) fail(error);
      });
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  };

  const send = (message: NestMessageEvent): boolean => {
    for (const chunk of formatSseMessage(message)) {
      if (!writeRaw(chunk)) {
        return false;
      }
    }

    return true;
  };

  function handleClose(): void {
    finish(false);
  }

  function handleError(error: Error): void {
    fail(error);
  }

  response.once('close', handleClose);
  response.on('error', handleError);
  socket?.on('error', handleError);

  return {
    close: () => finish(true, false),
    send,
    writeRaw,
  };
};
