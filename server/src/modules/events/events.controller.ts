import {
  BaseEventDto,
  CollectionHandlerFinishedEventDto,
  CollectionHandlerProgressedEventDto,
  CollectionHandlerStartedEventDto,
  RuleHandlerFinishedEventDto,
  RuleHandlerProgressedEventDto,
  RuleHandlerStartedEventDto,
} from '@maintainerr/contracts';
import {
  Controller,
  Get,
  MessageEvent as NestMessageEvent,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Response } from 'express';
import { IncomingMessage } from 'http';
import { interval, map, Subject } from 'rxjs';

@Controller('/api/events')
export class EventsController {
  private mostRecentEvent: NestMessageEvent | null = null;

  connectedClients = new Map<
    string,
    { close: () => void; subject: Subject<NestMessageEvent> }
  >();

  // Source: https://github.com/nestjs/nest/issues/12670
  @Get('stream')
  async stream(
    @Res() response: Response,
    @Req() request: RawBodyRequest<IncomingMessage>,
  ) {
    if (request?.socket) {
      request.socket.setKeepAlive(true);
      request.socket.setNoDelay(true);
      request.socket.setTimeout(0);
    }

    const subject = new Subject<NestMessageEvent>();
    const observer = {
      next: (msg: NestMessageEvent) => {
        if (msg.type) response.write(`event: ${msg.type}\n`);
        if (msg.id) response.write(`id: ${msg.id}\n`);
        if (msg.retry) response.write(`retry: ${msg.retry}\n`);

        response.write(`data: ${JSON.stringify(msg.data)}\n\n`);
      },
    };

    subject.subscribe(observer);

    const clientKey = String(Math.random());
    this.connectedClients.set(clientKey, {
      close: () => {
        response.end();
      },
      subject,
    });

    response.on('close', () => {
      subject.complete();
      pingSubscription.unsubscribe();
      this.connectedClients.delete(clientKey);
      response.end();
    });

    response.set({
      'Cache-Control':
        'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    });

    response.flushHeaders();
    response.write('\n');

    // Send data to the client every 30s to keep the connection alive
    const pingSubscription = interval(30 * 1000)
      .pipe(map(() => response.write(': ping\n\n')))
      .subscribe();

    if (this.mostRecentEvent) {
      const eventTime = (this.mostRecentEvent.data as BaseEventDto).time;
      if (eventTime > new Date(Date.now() - 5000)) {
        this.sendDataToClient(clientKey, this.mostRecentEvent);
        return;
      }
    }

    // TODO Handle the Last-Event-Id header.
    // We should send all events that are newer than the Last-Event-Id header.
    // An array with a TTL per event is probably sufficient.
  }

  @OnEvent('rule_handler.*')
  @OnEvent('collection_handler.*')
  sendEventToClient(
    payload:
      | RuleHandlerStartedEventDto
      | RuleHandlerProgressedEventDto
      | RuleHandlerFinishedEventDto
      | CollectionHandlerStartedEventDto
      | CollectionHandlerProgressedEventDto
      | CollectionHandlerFinishedEventDto,
  ) {
    const eventMessage: NestMessageEvent = {
      type: payload.type,
      data: payload,
    };

    for (const [, client] of this.connectedClients) {
      client.subject.next(eventMessage);
    }

    this.mostRecentEvent = eventMessage;
  }

  sendDataToClient(clientId: string, message: NestMessageEvent) {
    this.connectedClients.get(clientId)?.subject.next(message);
  }
}
