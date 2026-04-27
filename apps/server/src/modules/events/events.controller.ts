import {
  BaseEventDto,
  CollectionHandlerFinishedEventDto,
  CollectionHandlerProgressedEventDto,
  CollectionHandlerStartedEventDto,
  MaintainerrEvent,
  RuleHandlerFinishedEventDto,
  RuleHandlerProgressedEventDto,
  RuleHandlerQueueStatusUpdatedEventDto,
  RuleHandlerStartedEventDto,
} from '@maintainerr/contracts';
import {
  BeforeApplicationShutdown,
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
import { interval, Subscription } from 'rxjs';
import { createSseStreamClient, SseStreamClient } from '../../utils/sse-stream';
import { MaintainerrLogger } from '../logging/logs.service';
import { EventsBufferService } from './events-buffer.service';

@Controller('/api/events')
export class EventsController implements BeforeApplicationShutdown {
  private mostRecentEvent: NestMessageEvent | null = null;
  constructor(
    private readonly eventsBufferService: EventsBufferService,
    private readonly logger: MaintainerrLogger,
  ) {
    this.logger.setContext(EventsController.name);
  }

  connectedClients = new Map<string, SseStreamClient>();

  async beforeApplicationShutdown() {
    for (const [, client] of this.connectedClients) {
      client.close();
    }
  }

  // Source: https://github.com/nestjs/nest/issues/12670
  @Get('stream')
  async stream(
    @Res() response: Response,
    @Req() request: RawBodyRequest<IncomingMessage>,
  ) {
    const lastEventId = this.eventsBufferService.parseLastEventId(request);

    if (request?.socket) {
      request.socket.setKeepAlive(true);
      request.socket.setNoDelay(true);
      request.socket.setTimeout(0);
    }

    response.set({
      'Cache-Control':
        'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    });

    response.flushHeaders();

    const clientKey = String(Math.random());
    const subscriptions: { ping?: Subscription } = {};
    const client = createSseStreamClient({
      response,
      onClose: () => {
        subscriptions.ping?.unsubscribe();
        this.connectedClients.delete(clientKey);
      },
      onError: (error) => {
        this.logger.debug(error);
      },
    });

    this.connectedClients.set(clientKey, client);

    if (!client.writeRaw('\n')) {
      return;
    }

    // Send data to the client every 30s to keep the connection alive.
    subscriptions.ping = interval(30 * 1000).subscribe(() => {
      client.writeRaw(': ping\n\n');
    });

    const bufferedEvents = this.eventsBufferService.getEventsAfter(lastEventId);

    if (bufferedEvents.length) {
      for (const event of bufferedEvents) {
        this.sendDataToClient(clientKey, event);
      }
      return;
    }

    if (this.mostRecentEvent) {
      const eventTime = (this.mostRecentEvent.data as BaseEventDto).time;
      if (eventTime > new Date(Date.now() - 5000)) {
        this.sendDataToClient(clientKey, this.mostRecentEvent);
      }
    }
  }

  @OnEvent(MaintainerrEvent.RuleHandler_Started)
  @OnEvent(MaintainerrEvent.RuleHandler_Progressed)
  @OnEvent(MaintainerrEvent.RuleHandler_Finished)
  @OnEvent(MaintainerrEvent.CollectionHandler_Started)
  @OnEvent(MaintainerrEvent.CollectionHandler_Progressed)
  @OnEvent(MaintainerrEvent.CollectionHandler_Finished)
  @OnEvent(MaintainerrEvent.RuleHandlerQueue_StatusUpdated)
  sendEventToClient(
    payload:
      | RuleHandlerStartedEventDto
      | RuleHandlerProgressedEventDto
      | RuleHandlerFinishedEventDto
      | CollectionHandlerStartedEventDto
      | CollectionHandlerProgressedEventDto
      | CollectionHandlerFinishedEventDto
      | RuleHandlerQueueStatusUpdatedEventDto,
  ) {
    const eventMessage = this.eventsBufferService.buildBufferedEvent({
      type: payload.type,
      data: payload,
    });

    for (const [, client] of this.connectedClients) {
      client.send(eventMessage);
    }

    this.mostRecentEvent = eventMessage;
  }

  sendDataToClient(clientId: string, message: NestMessageEvent) {
    this.connectedClients.get(clientId)?.send(message);
  }
}
