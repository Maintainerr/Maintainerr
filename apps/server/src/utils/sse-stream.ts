import { MessageEvent as NestMessageEvent } from '@nestjs/common';
import { Response } from 'express';
import { Subject } from 'rxjs';

type SseStreamClientOptions = {
  response: Response;
  onClose: () => void;
  onError?: (error: unknown) => void;
};

export type SseStreamClient = {
  close: () => void;
  subject: Subject<NestMessageEvent>;
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
  const subject = new Subject<NestMessageEvent>();
  const socket = response.socket;
  let closed = false;

  const finish = (endResponse: boolean): void => {
    if (closed) return;

    closed = true;
    response.off('close', handleClose);
    response.off('error', handleError);
    socket?.off('error', handleError);
    subject.complete();
    subscription.unsubscribe();

    if (endResponse && isResponseWritable(response)) {
      try {
        response.end();
      } catch (error) {
        onError?.(error);
      }
    }

    onClose();
  };

  const fail = (error: unknown): void => {
    onError?.(error);
    finish(false);
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

  const writeMessage = (message: NestMessageEvent): boolean => {
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

  const subscription = subject.subscribe({
    next: writeMessage,
    error: fail,
  });

  response.once('close', handleClose);
  response.once('error', handleError);
  socket?.once('error', handleError);

  return {
    close: () => finish(true),
    subject,
    writeRaw,
  };
};
