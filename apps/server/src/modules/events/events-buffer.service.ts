import {
  Injectable,
  MessageEvent as NestMessageEvent,
  RawBodyRequest,
} from '@nestjs/common';
import { IncomingMessage } from 'http';

interface BufferedEvent {
  id: number;
  message: NestMessageEvent;
  timestamp: number;
}

@Injectable()
export class EventsBufferService {
  private static readonly EVENT_BUFFER_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly EVENT_BUFFER_MAX_SIZE = 100;

  private nextEventId = 1;
  private eventBuffer: BufferedEvent[] = [];

  parseLastEventId(
    request: RawBodyRequest<IncomingMessage>,
  ): number | undefined {
    const headerValue = request.headers['last-event-id'];

    if (!headerValue) {
      return undefined;
    }

    const idString = Array.isArray(headerValue)
      ? headerValue[headerValue.length - 1]
      : headerValue;

    const parsed = Number.parseInt(idString ?? '', 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  buildBufferedEvent(message: Omit<NestMessageEvent, 'id'>) {
    const eventId = this.nextEventId++;
    const eventMessage: NestMessageEvent = {
      ...message,
      id: String(eventId),
    };

    this.bufferEvent(eventId, eventMessage);
    return eventMessage;
  }

  getEventsAfter(lastEventId?: number): NestMessageEvent[] {
    if (lastEventId === undefined) {
      return [];
    }

    this.pruneEventBuffer(Date.now());
    return this.eventBuffer
      .filter((event) => event.id > lastEventId)
      .map((event) => event.message);
  }

  private bufferEvent(id: number, message: NestMessageEvent) {
    const timestamp = Date.now();

    this.eventBuffer.push({ id, message, timestamp });
    this.pruneEventBuffer(timestamp);
  }

  private pruneEventBuffer(now: number) {
    const cutoff = now - EventsBufferService.EVENT_BUFFER_TTL_MS;

    while (this.eventBuffer.length > 0) {
      const shouldDropOldest =
        this.eventBuffer[0].timestamp < cutoff ||
        this.eventBuffer.length > EventsBufferService.EVENT_BUFFER_MAX_SIZE;

      if (!shouldDropOldest) {
        break;
      }

      this.eventBuffer.shift();
    }
  }
}
